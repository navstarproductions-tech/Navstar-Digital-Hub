import { safeString } from './http.js';

const encoder = new TextEncoder();
const allowedModules = new Set([
  'students','employees','courses','course-notes','assignments','projects','certificates','transcripts',
  'report-cards','applications','scholarships','cyber-services','customer-uploads','photography','gallery',
  'music','institutional-documents','generated-reports'
]);
const mimeExtensions = new Map([
  ['application/pdf',['pdf']],
  ['image/jpeg',['jpg','jpeg']],['image/png',['png']],['image/webp',['webp']],['image/avif',['avif']],
  ['text/plain',['txt']],['text/csv',['csv']],
  ['application/msword',['doc']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',['docx']],
  ['application/vnd.ms-excel',['xls']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',['xlsx']],
  ['application/vnd.ms-powerpoint',['ppt']],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation',['pptx']],
  ['audio/mpeg',['mp3']],['audio/wav',['wav']],['audio/mp4',['m4a']],
  ['video/mp4',['mp4']],['video/quicktime',['mov']],['video/webm',['webm']],
  ['application/zip',['zip']]
]);
const maxDefaultBytes = 25 * 1024 * 1024;
const maxMediaBytes = 100 * 1024 * 1024;

export function storageConfig(env) {
  const accountId = safeString(env.R2_ACCOUNT_ID, 100);
  const accessKeyId = safeString(env.R2_ACCESS_KEY_ID, 200);
  const secretAccessKey = typeof env.R2_SECRET_ACCESS_KEY === 'string' ? env.R2_SECRET_ACCESS_KEY : '';
  const bucketName = safeString(env.R2_BUCKET_NAME, 120) || 'navstar-digital-hub-storage';
  const endpoint = safeString(env.R2_ENDPOINT, 500) || (accountId ? 'https://' + accountId + '.r2.cloudflarestorage.com' : '');
  if (!accountId || !accessKeyId || !secretAccessKey || !endpoint || !env.NAVSTAR_STORAGE) {
    throw new Error('Central Navstar storage is not configured. Add the NAVSTAR_STORAGE R2 binding and the five R2 server-side settings.');
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName, endpoint: new URL(endpoint) };
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}
async function sha256(value) {
  return hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value));
}
async function hmac(key, value) {
  const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(value)));
}
function encode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}
function canonicalQuery(entries) {
  return entries.map(([key,value]) => [encode(key),encode(String(value))])
    .sort((a,b) => a[0]===b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]))
    .map(([key,value]) => key + '=' + value).join('&');
}

export async function presignR2(env, method, objectKey, expiresSeconds = 300) {
  const config = storageConfig(env);
  const expires = Math.max(60, Math.min(900, Math.floor(Number(expiresSeconds) || 300)));
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\\.\\d{3}/g, '');
  const dateStamp = amzDate.slice(0,8);
  const region = 'auto';
  const service = 's3';
  const scope = dateStamp + '/' + region + '/' + service + '/aws4_request';
  const host = config.endpoint.host;
  const prefix = config.endpoint.pathname.replace(/\\/+$/,'');
  const encodedKey = objectKey.split('/').map(encode).join('/');
  const canonicalUri = prefix + '/' + encode(config.bucketName) + '/' + encodedKey;
  const credential = config.accessKeyId + '/' + scope;
  const query = [
    ['X-Amz-Algorithm','AWS4-HMAC-SHA256'],
    ['X-Amz-Credential',credential],
    ['X-Amz-Date',amzDate],
    ['X-Amz-Expires',String(expires)],
    ['X-Amz-SignedHeaders','host']
  ];
  const canonicalHeaders = 'host:' + host + '\\n';
  const signedHeaders = 'host';
  const canonicalRequest = [method.toUpperCase(),canonicalUri,canonicalQuery(query),canonicalHeaders,signedHeaders,'UNSIGNED-PAYLOAD'].join('\\n');
  const stringToSign = ['AWS4-HMAC-SHA256',amzDate,scope,await sha256(canonicalRequest)].join('\\n');
  const dateKey = await hmac(encoder.encode('AWS4' + config.secretAccessKey),dateStamp);
  const regionKey = await hmac(dateKey,region);
  const serviceKey = await hmac(regionKey,service);
  const signingKey = await hmac(serviceKey,'aws4_request');
  const signature = hex(await hmac(signingKey,stringToSign));
  const queryString = canonicalQuery([...query,['X-Amz-Signature',signature]]);
  return config.endpoint.protocol + '//' + host + canonicalUri + '?' + queryString;
}

export function validateUploadInput({ module, fileName, mimeType, size }) {
  const safeModule = safeString(module, 80).toLowerCase();
  const originalName = safeString(fileName, 240).replace(/[\\\\/\\r\\n\\0]/g,'').trim();
  const type = safeString(mimeType, 160).toLowerCase();
  const bytes = Number(size);
  if (!allowedModules.has(safeModule)) throw new Error('Choose a supported Navstar storage module.');
  if (!originalName || originalName === '.' || originalName === '..') throw new Error('Choose a file with a valid filename.');
  if (!Number.isSafeInteger(bytes) || bytes < 1) throw new Error('The selected file is empty or has an invalid size.');
  const extension = (originalName.split('.').pop() || '').toLowerCase();
  const extensions = mimeExtensions.get(type);
  if (!extensions || !extensions.includes(extension)) throw new Error('The file extension and detected MIME type do not match an allowed file format.');
  const media = type.startsWith('audio/') || type.startsWith('video/');
  const maximum = media ? maxMediaBytes : maxDefaultBytes;
  if (bytes > maximum) throw new Error('The selected file exceeds the ' + Math.round(maximum / 1024 / 1024) + ' MB upload limit.');
  return { module:safeModule, originalName, mimeType:type, extension, sizeBytes:bytes };
}

export async function verifyR2Object(env, objectKey, expected) {
  const config = storageConfig(env);
  const head = await env.NAVSTAR_STORAGE.head(objectKey);
  if (!head) throw new Error('The uploaded object was not found in private R2 storage.');
  if (Number(head.size) !== Number(expected.sizeBytes)) throw new Error('The uploaded file size does not match the upload request.');
  const storedType = String(head.httpMetadata?.contentType || '').toLowerCase();
  if (storedType !== String(expected.mimeType).toLowerCase()) throw new Error('The uploaded file MIME type does not match the approved file type.');
  const prefix = await env.NAVSTAR_STORAGE.get(objectKey,{range:{offset:0,length:64}});
  if (!prefix) throw new Error('The uploaded file could not be inspected.');
  const bytes = new Uint8Array(await prefix.arrayBuffer());
  const starts = (...values) => values.every((value,index)=>bytes[index]===value);
  const textPrefix = () => {
    try { const value = new TextDecoder('utf-8',{fatal:true}).decode(bytes); return !/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]/.test(value); } catch { return false; }
  };
  const type=expected.mimeType;
  let valid=true;
  if(type==='application/pdf') valid=starts(0x25,0x50,0x44,0x46,0x2D);
  else if(type==='image/jpeg') valid=starts(0xFF,0xD8,0xFF);
  else if(type==='image/png') valid=starts(0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A);
  else if(type==='image/webp') valid=starts(0x52,0x49,0x46,0x46)&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  else if(type==='image/avif') valid=String.fromCharCode(...bytes.slice(4,12)).includes('ftypavif');
  else if(['application/msword','application/vnd.ms-excel','application/vnd.ms-powerpoint'].includes(type)) valid=starts(0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1);
  else if(['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip'].includes(type)) valid=starts(0x50,0x4B,0x03,0x04)||starts(0x50,0x4B,0x05,0x06);
  else if(type==='audio/mpeg') valid=starts(0x49,0x44,0x33)||(bytes[0]===0xFF&&(bytes[1]&0xE0)===0xE0);
  else if(type==='audio/wav') valid=starts(0x52,0x49,0x46,0x46)&&String.fromCharCode(...bytes.slice(8,12))==='WAVE';
  else if(type==='video/mp4'||type==='audio/mp4'||type==='video/quicktime') valid=String.fromCharCode(...bytes.slice(4,8))==='ftyp';
  else if(type==='video/webm') valid=starts(0x1A,0x45,0xDF,0xA3);
  else if(type==='text/plain'||type==='text/csv') valid=textPrefix();
  if(!valid) throw new Error('The uploaded file contents do not match the declared file format.');
  return { sizeBytes:Number(head.size), etag:head.etag||null, uploadedAt:head.uploaded?.toISOString?.()||new Date().toISOString() };
}

export function canReadStoredFile(file, user) {
  if (!file || file.status !== 'active') return false;
  if (file.visibility === 'public') return true;
  if (['admin','principal'].includes(user?.role)) return true;
  return Boolean(user?.id && file.owner_id === user.id);
}

export function safeStorageDescription(value) {
  return safeString(value,1000);
}
