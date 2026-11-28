import { getSession, requireRole } from '../_shared/auth.js';
import { error, isSameOrigin, json, readJson, safeString, uuid } from '../_shared/http.js';

const managerRoles = ['admin','principal'];
const staffRoles = ['tutor','principal','finance','admissions'];

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS staff_assignments (
    id TEXT PRIMARY KEY,title TEXT NOT NULL,instructions TEXT NOT NULL DEFAULT '',due_at TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
    created_by TEXT REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS staff_assignment_recipients (
    id TEXT PRIMARY KEY,assignment_id TEXT NOT NULL REFERENCES staff_assignments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','submitted','returned','completed')),
    response_text TEXT NOT NULL DEFAULT '',attachment_url TEXT,submitted_at TEXT,feedback TEXT,
    reviewed_by TEXT REFERENCES users(id),reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(assignment_id,user_id)
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_staff_assignment_recipient_user ON staff_assignment_recipients(user_id,status,assignment_id)').run();
}

async function eligibleStaff(db) {
  const rows=await db.prepare(`
    SELECT u.id,u.name,u.email,COALESCE(NULLIF(p.portal_role,''),u.role) AS role,
      p.staff_id AS staffId,p.department,p.job_title AS jobTitle
    FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id
    WHERE u.status='active'
      AND (lower(COALESCE(NULLIF(p.portal_role,''),u.role))='tutor' OR COALESCE(p.is_teaching,0)=1)
    ORDER BY u.name
  `).all();
  return rows.results||[];
}

async function audit(db,userId,action,id) {
  await db.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
    .bind(uuid(),userId,action,'staff_assignment',id).run();
}

export async function onRequestGet({request,env}) {
  if(!env.DB)return error('Staff assignment database is not configured.',503);
  const user=await getSession(request,env);
  if(!user)return error('Sign in required.',401);
  if(user.mustChangePassword)return error('Change your temporary password before using this portal.',403);
  await ensureTables(env.DB);
  if(managerRoles.includes(user.role)){
    const [tasks,staff]=await Promise.all([
      env.DB.prepare(`SELECT a.*,u.name AS created_by_name,
        (SELECT COUNT(*) FROM staff_assignment_recipients r WHERE r.assignment_id=a.id) AS recipient_count,
        (SELECT COUNT(*) FROM staff_assignment_recipients r WHERE r.assignment_id=a.id AND r.status='submitted') AS submitted_count,
        (SELECT COUNT(*) FROM staff_assignment_recipients r WHERE r.assignment_id=a.id AND r.status='completed') AS completed_count
        FROM staff_assignments a LEFT JOIN users u ON u.id=a.created_by
        ORDER BY a.created_at DESC`).all(),
      eligibleStaff(env.DB)
    ]);
    const ids=(tasks.results||[]).map(x=>x.id);
    let recipients=[];
    if(ids.length){
      recipients=(await env.DB.prepare(`SELECT r.*,u.name AS staff_name,u.email AS staff_email,
        COALESCE(NULLIF(p.portal_role,''),u.role) AS staff_role,p.staff_id
        FROM staff_assignment_recipients r JOIN users u ON u.id=r.user_id
        LEFT JOIN user_profiles p ON p.user_id=u.id
        WHERE r.assignment_id IN (${ids.map(()=>'?').join(',')})
        ORDER BY u.name`).bind(...ids).all()).results||[];
    }
    return json({tasks:tasks.results||[],staff,recipients,role:user.role});
  }
  if(!staffRoles.includes(user.role))return error('This account cannot access staff assignments.',403);
  const profile=await env.DB.prepare('SELECT COALESCE(is_teaching,0) AS is_teaching FROM user_profiles WHERE user_id=?').bind(user.id).first();
  if(user.role!=='tutor'&&!Number(profile?.is_teaching||0))return error('Staff tasks are available to teaching staff accounts.',403);
  const result=await env.DB.prepare(`SELECT a.id,a.title,a.instructions,a.due_at,a.status AS assignment_status,
    r.id AS recipient_id,r.status,r.response_text,r.attachment_url,r.submitted_at,r.feedback,r.reviewed_at
    FROM staff_assignment_recipients r JOIN staff_assignments a ON a.id=r.assignment_id
    WHERE r.user_id=? AND a.status='published'
    ORDER BY a.due_at IS NULL,a.due_at,a.created_at DESC`).bind(user.id).all();
  return json({tasks:result.results||[],role:user.role});
}

export async function onRequestPost({request,env}) {
  if(!isSameOrigin(request))return error('Cross-origin request rejected.',403);
  if(!env.DB)return error('Staff assignment database is not configured.',503);
  const user=await getSession(request,env);
  if(!user)return error('Sign in required.',401);
  if(user.mustChangePassword)return error('Change your temporary password before using this portal.',403);
  await ensureTables(env.DB);
  let body;try{body=await readJson(request,262144)}catch{return error('Invalid request body.');}
  const action=safeString(body.action,40);

  if(['create','update','publish','archive','review'].includes(action)){
    const access=await requireRole(request,env,managerRoles);if(access.response)return access.response;
  }

  if(action==='create'){
    const title=safeString(body.title,180),instructions=safeString(body.instructions,12000),dueAt=safeString(body.dueAt,40)||null;
    if(title.length<2||instructions.length<2)return error('Enter a task title and clear instructions.');
    if(dueAt&&Number.isNaN(Date.parse(dueAt)))return error('Enter a valid deadline.');
    const staff=await eligibleStaff(env.DB),all=body.assignToAll===true;
    const requested=Array.isArray(body.recipientIds)?[...new Set(body.recipientIds.map(x=>safeString(x,80)).filter(Boolean))]:[];
    const eligible=new Set(staff.map(x=>x.id));
    const recipients=all?staff.map(x=>x.id):requested;
    if(!recipients.length)return error('Select at least one active teaching staff member or choose Assign to all teaching staff.');
    if(recipients.some(id=>!eligible.has(id)))return error('One or more selected recipients are not active teaching staff. No task was created.');
    const id=uuid(),status=body.status==='published'?'published':'draft';
    const statements=[
      env.DB.prepare('INSERT INTO staff_assignments(id,title,instructions,due_at,status,created_by) VALUES(?,?,?,?,?,?)').bind(id,title,instructions,dueAt,status,user.id),
      ...recipients.map(staffId=>env.DB.prepare('INSERT OR IGNORE INTO staff_assignment_recipients(id,assignment_id,user_id) VALUES(?,?,?)').bind(uuid(),id,staffId))
    ];
    try{await env.DB.batch(statements)}catch(cause){console.error('Staff assignment creation failed:',String(cause?.stack||cause));return error('The staff task could not be saved. No partial task was published.',500)}
    await audit(env.DB,user.id,'staff_assignment_created',id);
    return json({id,status,recipientCount:recipients.length},201);
  }

  if(action==='update'||action==='publish'||action==='archive'){
    const id=safeString(body.assignmentId,80);
    const existing=await env.DB.prepare('SELECT id,status FROM staff_assignments WHERE id=?').bind(id).first();
    if(!existing)return error('Staff task was not found.',404);
    if(action==='archive'){
      await env.DB.prepare("UPDATE staff_assignments SET status='archived',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
      await audit(env.DB,user.id,'staff_assignment_archived',id);
      return json({id,status:'archived'});
    }
    const title=safeString(body.title,180),instructions=safeString(body.instructions,12000),dueAt=safeString(body.dueAt,40)||null;
    const status=action==='publish'?'published':(['draft','published'].includes(body.status)?body.status:existing.status);
    if(action==='update'&&(title.length<2||instructions.length<2))return error('Enter a task title and clear instructions.');
    if(dueAt&&Number.isNaN(Date.parse(dueAt)))return error('Enter a valid deadline.');
    if(action==='publish'){
      await env.DB.prepare("UPDATE staff_assignments SET status='published',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
    }else{
      await env.DB.prepare('UPDATE staff_assignments SET title=?,instructions=?,due_at=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .bind(title,instructions,dueAt,status,id).run();
    }
    await audit(env.DB,user.id,action==='publish'?'staff_assignment_published':'staff_assignment_updated',id);
    return json({id,status});
  }

  if(action==='submit'){
    if(!staffRoles.includes(user.role))return error('Only assigned teaching staff can submit this task.',403);
    const profile=await env.DB.prepare('SELECT COALESCE(is_teaching,0) AS is_teaching FROM user_profiles WHERE user_id=?').bind(user.id).first();
    if(user.role!=='tutor'&&!Number(profile?.is_teaching||0))return error('This account is not registered as teaching staff.',403);
    const recipientId=safeString(body.recipientId,80),responseText=safeString(body.responseText,12000),attachmentUrl=safeString(body.attachmentUrl,1000);
    if(!responseText&&!attachmentUrl)return error('Write a response or attach a saved document before submitting.');
    if(attachmentUrl&&!/^https:\/\//i.test(attachmentUrl)&&!/^\/api\/(?:download|media|storage\/preview)\/[a-zA-Z0-9-]+$/.test(attachmentUrl))return error('Use a valid HTTPS or saved Navstar file link.');
    const row=await env.DB.prepare(`SELECT r.id,a.status AS assignment_status FROM staff_assignment_recipients r
      JOIN staff_assignments a ON a.id=r.assignment_id WHERE r.id=? AND r.user_id=?`).bind(recipientId,user.id).first();
    if(!row||row.assignment_status!=='published')return error('This task is not available to your account.',404);
    await env.DB.prepare("UPDATE staff_assignment_recipients SET response_text=?,attachment_url=?,status='submitted',submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(responseText,attachmentUrl||null,recipientId).run();
    return json({recipientId,status:'submitted'});
  }

  if(action==='review'){
    const recipientId=safeString(body.recipientId,80),status=['completed','returned'].includes(body.status)?body.status:'completed',feedback=safeString(body.feedback,4000);
    const row=await env.DB.prepare('SELECT id FROM staff_assignment_recipients WHERE id=?').bind(recipientId).first();
    if(!row)return error('Staff submission was not found.',404);
    await env.DB.prepare('UPDATE staff_assignment_recipients SET status=?,feedback=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(status,feedback,user.id,recipientId).run();
    await audit(env.DB,user.id,'staff_assignment_reviewed',recipientId);
    return json({recipientId,status});
  }
  return error('Unknown staff assignment action.');
}
