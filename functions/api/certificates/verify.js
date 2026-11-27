import { error, json } from '../../_shared/http.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return error('Certificate verification is unavailable.',503);
  const token = new URL(request.url).searchParams.get('token') || '';
  if (token.length < 32 || token.length > 128) return json({ valid:false, message:'Enter a valid certificate verification code.' },400);
  const row = await env.DB.prepare(`
    SELECT c.certificate_no AS certificateNo,c.status,c.issued_at AS issuedAt,c.snapshot_json AS snapshotJson
    FROM student_certificates c WHERE c.public_token=? LIMIT 1
  `).bind(token).first();
  if (!row) return json({ valid:false, message:'No certificate matches this verification code.' },404);
  let snapshot={};try{snapshot=JSON.parse(row.snapshotJson||'{}')}catch{}
  if (row.status !== 'issued') return json({ valid:false, status:row.status, certificateNo:row.certificateNo, message:'This certificate is not currently valid. Contact Navstar Digital Hub for confirmation.' });
  return json({ valid:true, certificate:{ certificateNo:row.certificateNo,studentName:snapshot.studentName,studentId:snapshot.studentId,courseTitle:snapshot.courseTitle,courseCode:snapshot.courseCode,admissionNumber:snapshot.admissionNumber,graduationDate:snapshot.graduationDate,reportCardNo:snapshot.reportCardNo,academicResults:Array.isArray(snapshot.academicResults)?snapshot.academicResults:[],grading:Array.isArray(snapshot.grading)?snapshot.grading:[],academicSummary:snapshot.academicSummary||{},issuedAt:row.issuedAt,issuer:snapshot.issuer,motto:snapshot.motto } });
}
