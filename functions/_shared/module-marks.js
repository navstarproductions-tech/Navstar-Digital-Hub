const toNumber = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const parseBands = value => String(value || '').split(/\r?\n/).map(line => line.split('|').map(part => part.trim()))
  .filter(parts => parts[0] && parts[2] !== '' && parts[3] !== '' && Number.isFinite(Number(parts[2])) && Number.isFinite(Number(parts[3])))
  .map(parts => ({ grade: parts[0], min: Number(parts[2]), max: Number(parts[3]), remarks: parts.slice(4).join(' | ') }));

async function configuration(db) {
  const row = await db.prepare("SELECT value FROM system_state WHERE key='admin-configuration'").first();
  try { return JSON.parse(row?.value || '{}'); } catch { return {}; }
}

function categoryOuts(config, rawMaxima) {
  const grading = config.grading || {};
  const weights = grading.marksWeights || grading.marks_weights || grading.weights || config.marksWeights || config.marks_weights || {};
  const cat = toNumber(grading.catOutOf ?? grading.cat_out_of ?? weights.CAT ?? weights.cat ?? weights.cat_out_of ?? weights.category_out_of?.CAT ?? weights.category_out_of?.cat);
  const practical = toNumber(grading.practicalOutOf ?? grading.practical_out_of ?? weights.Practical ?? weights.practical ?? weights.practical_out_of ?? weights.category_out_of?.Practical ?? weights.category_out_of?.practical);
  const final = toNumber(grading.finalOutOf ?? grading.final_out_of ?? weights.Final ?? weights.final ?? weights.exam ?? weights.exam_out_of ?? weights.category_out_of?.Final ?? weights.category_out_of?.final);
  const configured = cat > 0 && practical > 0 && final > 0 && cat + practical + final === 100;
  return configured
    ? { CAT: cat, Practical: practical, Final: final }
    : { CAT: 30, Practical: 20, Final: 50 };
}

export async function syncModuleResult(db, userId, moduleId, actorId = null) {
  const module = await db.prepare('SELECT id,course_id FROM course_modules WHERE id=?').bind(moduleId).first();
  if (!module || !userId) return null;

  const [assignmentRows, examRow, config] = await Promise.all([
    db.prepare(`SELECT a.marks_category,
      COALESCE(SUM(CASE WHEN s.status='graded' AND s.approval_status='approved' AND s.points_awarded IS NOT NULL THEN s.points_awarded*a.category_out_of/a.max_points ELSE 0 END),0) AS points,
      COALESCE(SUM(a.category_out_of),0) AS maximum,
      COUNT(CASE WHEN s.status='graded' AND s.approval_status='approved' AND s.points_awarded IS NOT NULL THEN s.id END) AS marked_count,
      COUNT(CASE WHEN s.status='graded' AND s.approval_status='approved' AND s.points_awarded IS NOT NULL AND NOT EXISTS(SELECT 1 FROM base44_student_import_map im WHERE im.entity_name='AssignmentSubmission' AND im.destination_id=s.id AND COALESCE(s.graded_at,'')<=COALESCE(im.imported_at,'')) THEN s.id END) AS native_marked_count
      FROM course_assignments a LEFT JOIN course_assignment_submissions s ON s.assignment_id=a.id AND s.user_id=?
      WHERE a.module_id=? GROUP BY a.marks_category`).bind(userId,moduleId).all(),
    db.prepare(`SELECT a.marks_category,
      COALESCE(SUM(CASE WHEN r.published_at IS NOT NULL THEN COALESCE(r.raw_points_awarded,r.points_awarded)*COALESCE(NULLIF(a.category_out_of,0),a.max_points)/a.max_points ELSE 0 END),0) AS points,
      COALESCE(SUM(COALESCE(NULLIF(a.category_out_of,0),a.max_points)),0) AS maximum,
      COUNT(CASE WHEN r.published_at IS NOT NULL THEN r.id END) AS papers,
      COUNT(CASE WHEN r.published_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM exam_runtime_attempts t JOIN base44_student_import_map im ON im.entity_name='ExamAttempt' AND im.destination_id=t.id WHERE t.assessment_id=r.assessment_id AND t.user_id=r.user_id AND COALESCE(r.marked_at,'')<=COALESCE(im.imported_at,'')) THEN r.id END) AS native_papers
      FROM course_assessments a LEFT JOIN course_assessment_results r ON r.assessment_id=a.id AND r.user_id=?
      WHERE a.module_id=? GROUP BY a.marks_category`).bind(userId,moduleId).all(),
    configuration(db),
  ]);

  const raw = { CAT: 0, Practical: 0, Final: 0 };
  const maxima = { CAT: 0, Practical: 0, Final: 0 };
  let finalExamPapers=0;
  for(const row of examRow.results||[]){const category=['CAT','Practical','Final'].includes(String(row.marks_category))?String(row.marks_category):'Final';raw[category]+=Number(row.points||0);maxima[category]+=Number(row.maximum||0);if(category==='Final')finalExamPapers+=Number(row.papers||0);}
  let assignmentScore = 0;
  for (const row of assignmentRows.results || []) {
    const category = ['CAT','Practical','Final'].includes(String(row.marks_category)) ? String(row.marks_category) : 'CAT';
    raw[category] += Number(row.points || 0);
    maxima[category] += Number(row.maximum || 0);
    assignmentScore += Number(row.points || 0);
  }

  const outs = categoryOuts(config, maxima);
  const categoryScore = {
    CAT: maxima.CAT > 0 ? raw.CAT / maxima.CAT * outs.CAT : 0,
    Practical: maxima.Practical > 0 ? raw.Practical / maxima.Practical * outs.Practical : 0,
    Final: maxima.Final > 0 ? raw.Final / maxima.Final * outs.Final : 0,
  };
  const maxScore = outs.CAT + outs.Practical + outs.Final;
  const score = categoryScore.CAT + categoryScore.Practical + categoryScore.Final;
  const hasAnyMarks = (assignmentRows.results||[]).some(row=>Number(row.marked_count||0)>0) || (examRow.results||[]).some(row=>Number(row.papers||0)>0);
  const hasNewMarks = (assignmentRows.results||[]).some(row=>Number(row.native_marked_count||0)>0) || (examRow.results||[]).some(row=>Number(row.native_papers||0)>0);
  const hasFinal = maxima.Final > 0 && finalExamPapers > 0;
  // Keep the original Base44 StudentResult authoritative while all attached assessment
  // marks are still imported history. Recompute only after a genuinely new mark is entered
  // in the official site; this prevents report-card generation from replacing historic
  // module grades with a partial reconstruction of imported exam/assignment records.
  const existing = await db.prepare(`SELECT r.*,
    EXISTS(SELECT 1 FROM base44_student_import_map x
      WHERE x.entity_name='StudentResult' AND x.destination_id=r.id AND x.user_id=r.user_id) AS imported_legacy
    FROM student_module_results r WHERE r.user_id=? AND r.module_id=?`).bind(userId,moduleId).first();
  if (existing?.imported_legacy && !hasNewMarks) return existing;
  if (existing?.imported_legacy && hasNewMarks) await db.prepare("UPDATE base44_student_import_map SET is_overridden=1 WHERE entity_name='StudentResult' AND destination_id=?").bind(existing.id).run();
  const bands = parseBands(config.grading?.gradeScale);
  const defaults = [
    { grade: 'A', min: 80, max: 100, remarks: 'Excellent performance' },
    { grade: 'B', min: 70, max: 79.99, remarks: 'Very good performance' },
    { grade: 'C', min: 60, max: 69.99, remarks: 'Good performance' },
    { grade: 'D', min: 50, max: 59.99, remarks: 'Satisfactory performance' },
    { grade: 'E', min: 40, max: 49.99, remarks: 'Needs improvement' },
    { grade: 'F', min: 0, max: 39.99, remarks: 'Below expectations' },
  ];
  const percentage = maxScore > 0 ? score / maxScore * 100 : 0;
  const band = (bands.length ? bands : defaults).find(item => percentage >= item.min && percentage <= item.max);
  const grade = hasFinal ? (band?.grade || '—') : hasAnyMarks ? 'I' : 'MM';
  const remarks = hasFinal ? (band?.remarks || 'Result published') : hasAnyMarks ? 'Awaiting Final Exam' : 'Missing Marks';
  const status = hasFinal ? 'published' : 'incomplete';
  const publishedAt = hasFinal ? new Date().toISOString() : null;
  await db.prepare(`INSERT INTO student_module_results
    (id,user_id,course_id,module_id,cat_score,practical_score,exam_score,assignment_score,score,max_score,grade,remarks,status,published_at,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id,module_id) DO UPDATE SET
      course_id=excluded.course_id,cat_score=excluded.cat_score,practical_score=excluded.practical_score,
      exam_score=excluded.exam_score,assignment_score=excluded.assignment_score,score=excluded.score,
      max_score=excluded.max_score,grade=excluded.grade,remarks=excluded.remarks,status=excluded.status,
      published_at=excluded.published_at,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .bind(crypto.randomUUID(),userId,module.course_id,moduleId,categoryScore.CAT,categoryScore.Practical,categoryScore.Final,
      assignmentScore,score,maxScore,grade,remarks,status,publishedAt,actorId).run();
  return { user_id:userId,course_id:module.course_id,module_id:moduleId,cat_score:categoryScore.CAT,
    practical_score:categoryScore.Practical,exam_score:categoryScore.Final,assignment_score:assignmentScore,
    score,max_score:maxScore,grade,remarks,status,published_at:publishedAt };
}

export async function syncStudentModuleResults(db, userId, courseId, actorId = null) {
  const modules = await db.prepare('SELECT id FROM course_modules WHERE course_id=? ORDER BY sort_order,title').bind(courseId).all();
  const results = [];
  for (const module of modules.results || []) results.push(await syncModuleResult(db,userId,module.id,actorId));
  return results;
}
