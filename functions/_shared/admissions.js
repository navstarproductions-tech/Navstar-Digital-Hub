import { safeString, uuid } from './http.js';
import { queueCustomerNotice } from './notifications.js';

function fail(message,status=409){const error=new Error(message);error.status=status;throw error;}
function initials(title){
  const words=String(title||'').trim().split(/\s+/).filter(Boolean);
  return (words.map(word=>word.replace(/[^A-Za-z]/g,'')[0]||'').join('').toUpperCase()||'NS').slice(0,3);
}
function intakeCode(value){
  const text=String(value||'').trim();
  const monthYear=text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/i);
  if(monthYear){
    const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
    return String(months.indexOf(monthYear[1].toLowerCase())+1).padStart(2,'0')+monthYear[2].slice(-2);
  }
  const numeric=text.match(/^(0[1-9]|1[0-2])\/?(\d{2}|20\d{2})$/);
  return numeric?numeric[1]+numeric[2].slice(-2):'';
}
export async function assignAdmissionNumber(context,enrollmentId,actorId,intakeNameOverride=''){
  const {env}=context,db=env.DB;
  const enrollment=await db.prepare(`SELECT e.id,e.admission_number,e.preferred_intake,e.full_name,e.email,e.phone,c.id AS course_id,c.title,c.course_code FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.id=?`).bind(enrollmentId).first();
  if(!enrollment)fail('Student application not found.',404);
  if(enrollment.admission_number)return {admissionNumber:enrollment.admission_number,alreadyAssigned:true};
  const intakeName=safeString(intakeNameOverride,80)||enrollment.preferred_intake;
  const intake=intakeCode(intakeName);
  if(!intake)fail('Set the student intake in the format September 2026 before accepting the application or generating an admission number.');
  if(intakeName&&intakeName!==enrollment.preferred_intake)await db.prepare('UPDATE enrollments SET preferred_intake=? WHERE id=?').bind(intakeName,enrollmentId).run();
  let courseCode=String(enrollment.course_code||'').trim().toUpperCase();
  if(!courseCode){
    const position=await db.prepare('SELECT COUNT(*) AS n FROM courses WHERE created_at < (SELECT created_at FROM courses WHERE id=?) OR (created_at=(SELECT created_at FROM courses WHERE id=?) AND id<=?)').bind(enrollment.course_id,enrollment.course_id,enrollment.course_id).first();
    const number=Number(position?.n||0);
    if(number<1||number>999)fail('Course sequence exceeds three digits. Set a valid course code in Course Management.');
    courseCode=initials(enrollment.title)+String(number).padStart(3,'0');
    try{await db.prepare('UPDATE courses SET course_code=? WHERE id=? AND (course_code IS NULL OR course_code=?)').bind(courseCode,enrollment.course_id,'').run();}
    catch{fail('The generated course code already exists. Set a unique course code in Course Management.');}
  }
  if(!/^[A-Z]{1,4}\d{3}$/.test(courseCode))fail('Set the course code in the format CP003 (letters followed by exactly three digits).');
  const seq=await db.prepare(`INSERT INTO admission_number_sequences(course_id,intake_code,last_number) VALUES(?,?,1)
    ON CONFLICT(course_id,intake_code) DO UPDATE SET last_number=last_number+1,updated_at=CURRENT_TIMESTAMP RETURNING last_number`).bind(enrollment.course_id,intake).first();
  const serial=Number(seq?.last_number||0);
  if(serial<1||serial>999)fail('This course and intake have reached the three-digit admission number limit.');
  const admissionNumber=courseCode+'/'+intake+'-'+String(serial).padStart(3,'0');
  await db.prepare('UPDATE enrollments SET admission_number=? WHERE id=? AND (admission_number IS NULL OR admission_number=?)').bind(admissionNumber,enrollmentId,'').run();
  const saved=await db.prepare('SELECT admission_number,full_name,email,phone FROM enrollments WHERE id=?').bind(enrollmentId).first();
  const finalNumber=saved?.admission_number||admissionNumber;
  if(finalNumber===admissionNumber){
    const message=`Dear ${saved.full_name}, your Navstar Digital Hub admission number is ${finalNumber}. Keep it safe and use it for all academic communication. HOME OF TECHNOCRATS.`;
    queueCustomerNotice(context,env,{email:saved.email,phone:saved.phone,subject:'Your Navstar admission number',message});
    await db.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(uuid(),actorId,'admission_number_generated','enrollment',enrollmentId).run();
  }
  return {admissionNumber:finalNumber,courseCode,intakeCode:intake,notificationQueued:finalNumber===admissionNumber};
}
