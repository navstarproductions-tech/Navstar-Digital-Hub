import { hashPassword, sha256 } from '../../../_shared/auth.js';
import { error, json, uuid } from '../../../_shared/http.js';

const allowedOrigins = new Set(['https://navstardigitalhub.base44.app', 'https://app.base44.com']);
const corsHeaders = origin => ({ 'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'null', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600', 'Vary': 'Origin' });
const clean = (v, n=500) => String(v ?? '').trim().slice(0,n);
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const norm = v => clean(v,160).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const dateOnly = v => { const m=clean(v,40).match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : ''; };
const aliases = {
  'computer programming':'computer-programming',
  'advanced level computer programming':'advanced-programming',
  'advanced computer programming':'advanced-programming',
  'robotics and automation':'robotics-automation',
  'automation and robotics':'robotics-automation',
  'web design':'web-design',
  'graphic design':'graphic-design',
  'introduction to video editing':'video-editing',
  'html and css coding course':'html-css',
  'html and css coding':'html-css',
  'basic maintenance and troubleshooting':'computer-maintenance',
  'integrated digital service delivery':'integrated-digital-services',
  'python programming':'python-programming'
};
function lifecycle(r) {
  const s=clean(r.status || r.current_status,40).toLowerCase();
  if(s==='suspended'||s==='deferred') return {account:'disabled',profile:'suspended',graduation:null};
  if(s==='dismissed') return {account:'disabled',profile:'archived',graduation:null};
  if(s==='graduated') return {account:'active',profile:'archived',graduation:'graduated'};
  if(s==='completed') return {account:'active',profile:'archived',graduation:'eligible'};
  return {account:'active',profile:'active',graduation:null};
}
function safeDetails(r) {
  const out={};
  for(const [k,v] of Object.entries(r||{})) if(!/password|credential|biometric|fingerprint/i.test(k)) out[k]=v;
  return JSON.stringify(out);
}
function normalizeFeeItems(r) {
  const supplied=Array.isArray(r.fee_items)?r.fee_items.filter(x=>x&&typeof x==='object'):[];
  const raw=supplied.length?supplied:[
    {label:'Registration Fee',amount:r.registration_fee},
    {label:'Tuition Fee',amount:r.tuition_fee},
    {label:'Examination Fee',amount:r.exam_fee},
    {label:'Certificate Fee',amount:r.certificate_fee}
  ].filter(x=>x.amount!==null&&x.amount!==undefined&&x.amount!=='');
  const total=Math.max(0,Math.round(num(r.total_fee)));
  const sum=raw.reduce((a,x)=>a+num(x.amount),0);
  const rounded=raw.reduce((a,x)=>a+Math.round(num(x.amount)),0);
  if(!raw.length||total<=0) return [];
  if(Math.abs(sum-num(r.total_fee))>1||rounded!==total) {
    const reg=raw.find(x=>norm(x.label||x.item_name)==='registration fee');
    const admission=Math.min(total,Math.max(100,Math.round(num(reg?.amount)||100)));
    return [{itemName:'Admission fee',amount:admission,dueStage:'enrollment',sortOrder:1},{itemName:'Course fee balance',amount:Math.max(0,total-admission),dueStage:'before_term',sortOrder:2}];
  }
  return raw.map((x,i)=>{
    const label=clean(x.label||x.item_name||x.name||('Fee item '+(i+1)),100);
    return {itemName:norm(label)==='registration fee'?'Admission fee':label,amount:Math.max(0,Math.round(num(x.amount))),dueStage:/admission|registration/i.test(label)?'enrollment':'before_term',sortOrder:i+1};
  });
}
async function courseFor(DB,title,price=0) {
  const t=clean(title,160), n=norm(t);
  if(!n) throw new Error('A student or fee record has no course title.');
  const alias=aliases[n];
  if(alias) { const c=await DB.prepare('SELECT id,title,status FROM courses WHERE id=?').bind(alias).first(); if(c)return {...c,created:false}; }
  const exact=await DB.prepare('SELECT id,title,status FROM courses WHERE lower(trim(title))=lower(trim(?)) LIMIT 1').bind(t).first();
  if(exact)return {...exact,created:false};
  const id='base44-'+n.replace(/\s+/g,'-').slice(0,48);
  await DB.prepare("INSERT OR IGNORE INTO courses(id,title,description,duration,image_url,category,price,status) VALUES(?,?,?,'','','Legacy course',?,'archived')")
    .bind(id,t,'Historical course retained for migrated student and fee records.',Math.max(0,Math.round(price))).run();
  const c=await DB.prepare('SELECT id,title,status FROM courses WHERE id=?').bind(id).first();
  return {...c,created:true};
}
function passwordCredential(r) {
  const c=r.student_password_credential||r.password_credential||r.login_password_credential||r.portal_password_credential;
  return c&&c.algorithm==='PBKDF2-SHA256'&&c.salt&&c.hash?{salt:c.salt,hash:c.hash,mustChange:0}:null;
}
async function importFeeStructure(DB,r,c) {
  const sourceId=clean(r.id||r._id||r.uuid,120);
  if(!sourceId)return;
  const course=await courseFor(DB,r.course_title,r.total_fee);
  if(course.created)c.archivedCoursesCreated++;
  const items=normalizeFeeItems(r);
  if(!items.length){c.feeStructuresSkipped++;c.warnings.push('Fee structure for '+clean(r.course_title,120)+' had no usable amounts and remains in the secure migration archive.');return;}
  await DB.prepare('UPDATE course_fee_items SET active=0,updated_at=CURRENT_TIMESTAMP WHERE course_id=?').bind(course.id).run();
  for(const item of items) {
    const id='b44fee-'+sourceId.slice(-16)+'-'+item.sortOrder;
    await DB.prepare("INSERT INTO course_fee_items(id,course_id,item_name,amount,due_stage,required,sort_order,active) VALUES(?,?,?,?,?,1,?,1) ON CONFLICT(course_id,item_name) DO UPDATE SET amount=excluded.amount,due_stage=excluded.due_stage,required=1,sort_order=excluded.sort_order,active=1,updated_at=CURRENT_TIMESTAMP")
      .bind(id,course.id,item.itemName,item.amount,item.dueStage,item.sortOrder).run();
  }
  const total=items.reduce((a,x)=>a+x.amount,0);
  await DB.prepare('UPDATE courses SET price=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(total,course.id).run();
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id) VALUES('FeeStructure',?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,imported_at=CURRENT_TIMESTAMP")
    .bind(sourceId,course.id).run();
  c.feeStructuresImported++;
}
async function importStudent(DB,r,adminId,c) {
  const sourceId=clean(r.id||r._id||r.uuid,120);
  const email=clean(r.student_email||r.email,254).toLowerCase();
  const name=clean(r.student_name||r.full_name||r.name,120);
  const phone=clean(r.student_phone||r.phone,40);
  if(!sourceId||!email||!name||!phone){c.skippedStudents++;return null;}
  const course=await courseFor(DB,r.course_title,r.total_fee);
  if(course.created)c.archivedCoursesCreated++;
  const mapping=await DB.prepare("SELECT destination_id,user_id FROM base44_student_import_map WHERE entity_name='Enrollment' AND source_id=?").bind(sourceId).first();
  const enrollmentId=mapping?.destination_id||'b44-enr-'+sourceId.slice(-24);
  let user=await DB.prepare('SELECT id,role,status FROM users WHERE lower(email)=lower(?)').bind(email).first();
  if(user&&user.role!=='student'){c.skippedStudents++;c.warnings.push('Skipped '+email+': the email is already used by a non-student account.');return null;}
  if(!user) {
    const credential=passwordCredential(r);
    const generated=credential||await hashPassword(clean(crypto.randomUUID()+crypto.randomUUID(),100));
    const state=lifecycle(r);
    const createdAt=clean(r.created_date||r.created_at,40)||new Date().toISOString();
    const userId='b44usr-'+sourceId.slice(-24);
    await DB.prepare("INSERT OR IGNORE INTO users(id,name,email,role,password_hash,password_salt,must_change_password,status,created_at) VALUES(?,?,?,'student',?,?,?,?,?)")
      .bind(userId,name,email,generated.hash,generated.salt,generated.mustChange??1,state.account,createdAt).run();
    user=await DB.prepare('SELECT id,role,status FROM users WHERE lower(email)=lower(?)').bind(email).first();
    if(!credential)c.passwordSetupRequired++;
    if(user)c.accountsCreated++;
  } else {
    c.existingAccountsLinked++;
    await DB.prepare("UPDATE users SET name=? WHERE id=? AND role='student' AND (name='' OR name IS NULL)").bind(name,user.id).run();
  }
  if(!user){c.skippedStudents++;return null;}
  const state=lifecycle(r);
  const profile=await DB.prepare('SELECT staff_id FROM user_profiles WHERE user_id=?').bind(user.id).first();
  const staffId=profile?.staff_id||'STB44'+sourceId.replace(/[^a-z0-9]/gi,'').slice(-10).toUpperCase();
  const address=[r.street,r.location,r.sublocation||r.sub_location,r.ward,r.subcounty||r.sub_county,r.county].map(x=>clean(x,100)).filter(Boolean).join(', ');
  await DB.prepare(`
    INSERT INTO user_profiles(user_id,staff_id,portal_role,phone,date_of_birth,gender,citizenship,country,province,county,sub_county,ward,location,sub_location,profile_photo_url,national_id,address,student_status)
    VALUES(?,?,'student',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      portal_role='student',
      phone=COALESCE(NULLIF(excluded.phone,''),user_profiles.phone),
      date_of_birth=COALESCE(NULLIF(excluded.date_of_birth,''),user_profiles.date_of_birth),
      gender=COALESCE(NULLIF(excluded.gender,''),user_profiles.gender),
      citizenship=COALESCE(NULLIF(excluded.citizenship,''),user_profiles.citizenship),
      country=COALESCE(NULLIF(excluded.country,''),user_profiles.country),
      province=COALESCE(NULLIF(excluded.province,''),user_profiles.province),
      county=COALESCE(NULLIF(excluded.county,''),user_profiles.county),
      sub_county=COALESCE(NULLIF(excluded.sub_county,''),user_profiles.sub_county),
      ward=COALESCE(NULLIF(excluded.ward,''),user_profiles.ward),
      location=COALESCE(NULLIF(excluded.location,''),user_profiles.location),
      sub_location=COALESCE(NULLIF(excluded.sub_location,''),user_profiles.sub_location),
      profile_photo_url=COALESCE(NULLIF(excluded.profile_photo_url,''),user_profiles.profile_photo_url),
      national_id=COALESCE(NULLIF(excluded.national_id,''),user_profiles.national_id),
      address=COALESCE(NULLIF(excluded.address,''),user_profiles.address),
      student_status=excluded.student_status,updated_at=CURRENT_TIMESTAMP
  `).bind(
    user.id,staffId,phone,dateOnly(r.date_of_birth)||null,clean(r.gender,40)||null,clean(r.nationality,80)||null,
    clean(r.country,80)||'Kenya',clean(r.province,80)||null,clean(r.county,80)||null,clean(r.subcounty||r.sub_county,80)||null,
    clean(r.ward,80)||null,clean(r.location,100)||null,clean(r.sublocation||r.sub_location,100)||null,
    clean(r.student_photo_url,1000)||null,clean(r.national_id,80)||null,address||null,state.profile
  ).run();
  let admission=clean(r.admission_number,80)||null;
  if(admission) {
    const duplicate=await DB.prepare('SELECT id FROM enrollments WHERE admission_number=? AND id<>?').bind(admission,enrollmentId).first();
    if(duplicate){c.warnings.push('Admission number collision for '+email+'; original value remains in imported details, but was not assigned as a unique live admission number.');admission=null;}
  }
  const existing=await DB.prepare('SELECT id FROM enrollments WHERE id=?').bind(enrollmentId).first();
  if(!existing) {
    const ref='B44-'+sourceId.replace(/[^a-z0-9]/gi,'').slice(-16).toUpperCase();
    const createdAt=clean(r.created_date||r.created_at,40)||new Date().toISOString();
    const contactName=clean(r.next_of_kin_name||r.guardian_name||r.mother_name||r.father_name,120)||'Not recorded';
    const contactPhone=clean(r.next_of_kin_phone||r.guardian_phone||r.mother_phone||r.father_phone,40)||'Not recorded';
    await DB.prepare(`
      INSERT INTO enrollments(
        id,display_ref,admission_number,course_id,full_name,email,phone,date_of_birth,identity_type,identity_number,gender,nationality,
        study_mode,education_level,preferred_intake,experience,county,town,address,sub_county,ward,location,sub_location,
        emergency_contact_name,emergency_contact_phone,emergency_contact_relationship,support_needs,consent,status,payment_status,
        application_details_json,admitted_user_id,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,'accepted','unpaid',?,?,?)
    `).bind(
      enrollmentId,ref,admission,course.id,name,email,phone,dateOnly(r.date_of_birth)||'',clean(r.id_type,40)||null,
      clean(r.national_id,80)||null,clean(r.gender,40)||null,clean(r.nationality,80)||null,
      clean(r.study_mode,40)||'Not recorded',clean(r.education_level,80)||'Not recorded',
      clean(r.intake_label||r.intake_id,80)||null,clean(r.previous_school||r.education_year_completed,160)||null,
      clean(r.county,80)||'Not recorded',clean(r.location||r.subcounty||r.county,120)||'Not recorded',address||null,
      clean(r.subcounty||r.sub_county,80)||null,clean(r.ward,80)||null,clean(r.location,100)||null,
      clean(r.sublocation||r.sub_location,100)||null,contactName,contactPhone,clean(r.next_of_kin_relationship,80)||null,
      clean(r.support_needs,1000)||null,safeDetails(r),user.id,createdAt
    ).run();
    c.enrollmentsCreated++;
  } else c.enrollmentsAlreadyPresent++;
  await DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('Enrollment',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
    .bind(sourceId,enrollmentId,user.id).run();
  if(state.graduation) {
    await DB.prepare("INSERT INTO student_graduation_records(id,user_id,course_id,status,completed_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET status=excluded.status,completed_at=COALESCE(excluded.completed_at,student_graduation_records.completed_at),updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP")
      .bind('b44grad-'+sourceId.slice(-20),user.id,course.id,state.graduation,dateOnly(r.completion_date)||dateOnly(r.updated_date)||null,adminId).run();
  }
  const amountPaid=Math.max(0,Math.round(num(r.amount_paid)));
  const additionalFee=Math.max(0,Math.round(num(r.additional_fee)));
  const hasBalance=r.fee_balance!==null&&r.fee_balance!==undefined&&r.fee_balance!=='';
  const totalDue=Math.max(0,Math.round(hasBalance?amountPaid+num(r.fee_balance):num(r.total_fee)+additionalFee));
  const baseFee=Math.max(0,totalDue-additionalFee);
  // Replace the trigger's current-course snapshot with this learner's historical total,
  // so old discounts and prior fee agreements do not get overwritten by today's course fee.
  await DB.prepare('DELETE FROM enrollment_fee_items WHERE enrollment_id=?').bind(enrollmentId).run();
  const feeDate=clean(r.created_date,40)||new Date().toISOString();
  if(baseFee>0) await DB.prepare("INSERT OR IGNORE INTO enrollment_fee_items(id,enrollment_id,fee_item_id,item_name,amount,due_stage,created_at) VALUES(?,?,NULL,'Legacy course fee total',?,'before_term',?)")
    .bind('b44enrfee-'+sourceId.slice(-24),enrollmentId,baseFee,feeDate).run();
  if(additionalFee>0) await DB.prepare("INSERT OR IGNORE INTO enrollment_fee_items(id,enrollment_id,fee_item_id,item_name,amount,due_stage,created_at) VALUES(?,?,NULL,?,?,'anytime',?)")
    .bind('b44enradd-'+sourceId.slice(-24),enrollmentId,'Additional fee - '+(clean(r.additional_fee_reason,80)||'Other'),additionalFee,feeDate).run();
  if(totalDue>0&&baseFee===0&&additionalFee===0) await DB.prepare("INSERT OR IGNORE INTO enrollment_fee_items(id,enrollment_id,fee_item_id,item_name,amount,due_stage,created_at) VALUES(?,?,NULL,'Legacy student fee total',?,'before_term',?)")
    .bind('b44enrtotal-'+sourceId.slice(-24),enrollmentId,totalDue,feeDate).run();
  return {sourceId,enrollmentId,userId:user.id,amountPaid,totalFee:totalDue,source:r};
}
export async function onRequestOptions({request}) { return new Response(null,{status:204,headers:corsHeaders(request.headers.get('Origin')||'')}); }
export async function onRequestPost({request,env}) {
  const origin=request.headers.get('Origin')||'';
  if(!allowedOrigins.has(origin))return error('Origin not allowed.',403);
  const headers=corsHeaders(origin);
  const auth=request.headers.get('Authorization')||'';
  const token=auth.startsWith('Bearer ')?auth.slice(7).trim():'';
  if(!token||!env.DB)return new Response(JSON.stringify({error:'A valid migration token is required.'}),{status:401,headers:{...headers,'Content-Type':'application/json'}});
  const tokenHash=await sha256(token);
  const tokenRow=await env.DB.prepare('SELECT token_hash,expires_at,used_at,records_received,created_by FROM base44_migration_tokens WHERE token_hash=?').bind(tokenHash).first();
  if(!tokenRow||tokenRow.used_at||new Date(tokenRow.expires_at).getTime()<Date.now())return new Response(JSON.stringify({error:'Migration token is invalid, expired, or already completed.'}),{status:401,headers:{...headers,'Content-Type':'application/json'}});
  const staged=await env.DB.prepare("SELECT entity_name,source_id,record_json FROM base44_legacy_records WHERE migration_batch=? AND entity_name IN ('Enrollment','FeeStructure','FeePayment','AdditionalFee') ORDER BY entity_name,source_id").bind(tokenHash).all();
  const groups={Enrollment:[],FeeStructure:[],FeePayment:[],AdditionalFee:[]};
  for(const row of staged.results||[]) {
    try{groups[row.entity_name].push(JSON.parse(row.record_json));}
    catch{return new Response(JSON.stringify({error:'A staged student or fee record could not be read. The transfer was not completed.'}),{status:500,headers:{...headers,'Content-Type':'application/json'}});}
  }
  if(!groups.Enrollment.length)return new Response(JSON.stringify({error:'No student records received. Export Enrollment, FeeStructure, FeePayment and AdditionalFee from Base44, then retry.'}),{status:400,headers:{...headers,'Content-Type':'application/json'}});
  const c={sourceStudents:groups.Enrollment.length,accountsCreated:0,existingAccountsLinked:0,enrollmentsCreated:0,enrollmentsAlreadyPresent:0,skippedStudents:0,passwordSetupRequired:0,feeStructuresImported:0,feeStructuresSkipped:0,feePaymentsImported:0,additionalFeesImported:0,additionalFeesSkipped:0,openingBalanceEntries:0,archivedCoursesCreated:0,warnings:[]};
  try {
    for(const fee of groups.FeeStructure)await importFeeStructure(env.DB,fee,c);
    const imported=[];
    for(const student of groups.Enrollment){const item=await importStudent(env.DB,student,tokenRow.created_by,c);if(item)imported.push(item);}
    for(const fee of groups.AdditionalFee) {
      const sourceId=clean(fee.id||fee._id||fee.uuid,120);
      const sourceEnrollmentId=clean(fee.enrollment_id,120);
      const mapping=await env.DB.prepare("SELECT destination_id,user_id FROM base44_student_import_map WHERE entity_name='Enrollment' AND source_id=?").bind(sourceEnrollmentId).first();
      const amount=Math.round(num(fee.amount));
      if(!sourceId||!mapping||amount<=0||clean(fee.status,40).toLowerCase()==='deactivated') { c.additionalFeesSkipped++; continue; }
      const itemName='Additional fee - '+(clean(fee.reason||fee.description,80)||'Other');
      await env.DB.prepare("INSERT OR IGNORE INTO enrollment_fee_items(id,enrollment_id,fee_item_id,item_name,amount,due_stage,created_at) VALUES(?,?,NULL,? ,?,'anytime',?)")
        .bind('b44addfee-'+sourceId.slice(-24),mapping.destination_id,itemName,amount,clean(fee.issued_date||fee.created_date,40)||new Date().toISOString()).run();
      await env.DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('AdditionalFee',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
        .bind(sourceId,'b44addfee-'+sourceId.slice(-24),mapping.user_id).run();
      c.additionalFeesImported++;
    }
    // A learner may have several course enrolments. Keep one account and derive its overall status from all of them.
    const lifecycleByEmail=new Map();
    for(const student of groups.Enrollment) {
      const email=clean(student.student_email||student.email,254).toLowerCase();
      if(!email)continue;
      const st=clean(student.status||student.current_status,40).toLowerCase();
      const current=lifecycleByEmail.get(email)||{hasActive:false,hasSuspended:false,hasGraduate:false,hasDismissed:false};
      if(st==='active')current.hasActive=true;
      if(st==='suspended'||st==='deferred')current.hasSuspended=true;
      if(st==='graduated'||st==='completed')current.hasGraduate=true;
      if(st==='dismissed')current.hasDismissed=true;
      lifecycleByEmail.set(email,current);
    }
    for(const [email,state] of lifecycleByEmail) {
      const accountStatus=state.hasActive||state.hasGraduate?'active':'disabled';
      const profileStatus=state.hasActive?'active':state.hasSuspended?'suspended':'archived';
      const account=await env.DB.prepare('SELECT id FROM users WHERE lower(email)=lower(?)').bind(email).first();
      if(account?.id?.startsWith('b44usr-')) {
        await env.DB.prepare('UPDATE users SET status=? WHERE id=?').bind(accountStatus,account.id).run();
        await env.DB.prepare('UPDATE user_profiles SET student_status=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?').bind(profileStatus,account.id).run();
      }
    }
    const paidByEnrollment=new Map();
    for(const payment of groups.FeePayment) {
      const sourcePaymentId=clean(payment.id||payment._id||payment.uuid,120);
      const sourceEnrollmentId=clean(payment.enrollment_id,120);
      if(!sourcePaymentId||!sourceEnrollmentId)continue;
      const mapping=await env.DB.prepare("SELECT destination_id,user_id FROM base44_student_import_map WHERE entity_name='Enrollment' AND source_id=?").bind(sourceEnrollmentId).first();
      if(!mapping){c.warnings.push('A fee payment was skipped because its student enrollment was not imported.');continue;}
      const amount=Math.round(num(payment.amount));
      if(amount<=0)continue;
      const st=clean(payment.status,40).toLowerCase();
      const status=st==='verified'||st==='paid'||payment.amount_confirmed===true?'paid':st==='rejected'||st==='failed'?'failed':'pending';
      const paymentId='b44pay-'+sourcePaymentId.slice(-24);
      await env.DB.prepare("INSERT OR IGNORE INTO payments(id,purpose,reference_id,phone,amount,status,receipt_number,internal_receipt_number,display_reference,result_description,transaction_date,created_at,updated_at) VALUES(?,'enrollment',?,?,?,?,?,?,?,?,?,?,?)")
        .bind(paymentId,mapping.destination_id,clean(payment.payment_phone,40)||clean(payment.phone,40)||'Not recorded',amount,status,
          clean(payment.mpesa_code,80)||null,'B44-PAY-'+sourcePaymentId.replace(/[^a-z0-9]/gi,'').slice(-16).toUpperCase(),
          'BASE44-FEE-'+sourcePaymentId.slice(-10).toUpperCase(),
          'Imported student fee payment from Base44 ('+clean(payment.payment_method,40)+').',
          clean(payment.payment_date||payment.created_date,40)||null,
          clean(payment.created_date,40)||new Date().toISOString(),
          clean(payment.updated_date||payment.created_date,40)||new Date().toISOString()).run();
      if(status==='paid')paidByEnrollment.set(sourceEnrollmentId,(paidByEnrollment.get(sourceEnrollmentId)||0)+amount);
      await env.DB.prepare("INSERT INTO base44_student_import_map(entity_name,source_id,destination_id,user_id) VALUES('FeePayment',?,?,?) ON CONFLICT(entity_name,source_id) DO UPDATE SET destination_id=excluded.destination_id,user_id=excluded.user_id,imported_at=CURRENT_TIMESTAMP")
        .bind(sourcePaymentId,paymentId,mapping.user_id).run();
      c.feePaymentsImported++;
    }
    for(const item of imported) {
      const targetPaid=Math.max(0,Math.round(item.amountPaid));
      const detailPaid=paidByEnrollment.get(item.sourceId)||0;
      const opening=Math.max(0,targetPaid-detailPaid);
      if(opening>0) {
        const openingId='b44open-'+item.sourceId.slice(-24);
        await env.DB.prepare("INSERT OR IGNORE INTO payments(id,purpose,reference_id,phone,amount,status,internal_receipt_number,display_reference,result_description,created_at,updated_at) VALUES(?,'enrollment',?,?,?,'paid',?,?,?,?,?)")
          .bind(openingId,item.enrollmentId,clean(item.source.student_phone,40)||'Not recorded',opening,
            'B44-OPEN-'+item.sourceId.replace(/[^a-z0-9]/gi,'').slice(-16).toUpperCase(),
            'BASE44-OPENING-'+item.sourceId.slice(-10).toUpperCase(),
            'Imported cumulative opening balance from Base44 Enrollment.amount_paid; individual fee receipts are listed separately.',
            clean(item.source.created_date,40)||new Date().toISOString(),
            clean(item.source.updated_date||item.source.created_date,40)||new Date().toISOString()).run();
        c.openingBalanceEntries++;
      }
      const paid=Math.max(targetPaid,detailPaid);
      const due=Math.max(0,Math.round(item.totalFee));
      const paymentStatus=due>0&&paid>=due?'paid':paid>0?'pending':'unpaid';
      await env.DB.prepare('UPDATE enrollments SET payment_status=? WHERE id=?').bind(paymentStatus,item.enrollmentId).run();
    }
    await env.DB.prepare('UPDATE base44_migration_tokens SET used_at=CURRENT_TIMESTAMP WHERE token_hash=? AND used_at IS NULL').bind(tokenHash).run();
    await env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
      .bind(uuid(),tokenRow.created_by,'base44_student_and_fee_migration_completed','migration',tokenHash.slice(0,24)).run();
    return new Response(JSON.stringify({
      completed:true,scope:['Enrollment','FeeStructure','FeePayment','AdditionalFee'],
      studentEnrollmentsImported:c.sourceStudents-c.skippedStudents,studentAccountsCreated:c.accountsCreated,existingAccountsLinked:c.existingAccountsLinked,
      enrollmentsCreated:c.enrollmentsCreated,enrollmentsAlreadyPresent:c.enrollmentsAlreadyPresent,skippedStudents:c.skippedStudents,
      passwordSetupRequired:c.passwordSetupRequired,feeStructuresImported:c.feeStructuresImported,feeStructuresSkipped:c.feeStructuresSkipped,
      feePaymentsImported:c.feePaymentsImported,additionalFeesImported:c.additionalFeesImported,additionalFeesSkipped:c.additionalFeesSkipped,openingBalanceEntries:c.openingBalanceEntries,archivedCoursesCreated:c.archivedCoursesCreated,warnings:c.warnings
    }),{status:200,headers:{...headers,'Content-Type':'application/json'}});
  } catch(cause) {
    console.error('Focused Base44 student/fee migration failed:',String(cause?.message||cause));
    return new Response(JSON.stringify({error:'The student and fee transfer stopped before completion. The token remains available for retry.',detail:String(cause?.message||cause),progress:c}),{status:500,headers:{...headers,'Content-Type':'application/json'}});
  }
}
