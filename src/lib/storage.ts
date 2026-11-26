export type NavstarStorageModule =
  | 'students' | 'employees' | 'courses' | 'course-notes' | 'assignments' | 'projects'
  | 'certificates' | 'transcripts' | 'report-cards' | 'applications' | 'scholarships'
  | 'cyber-services' | 'customer-uploads' | 'photography' | 'gallery' | 'music'
  | 'institutional-documents' | 'generated-reports';

export type NavstarStoredFile = {
  id:string; originalName:string; module:string; mimeType:string; sizeBytes:number;
  visibility:'private'|'public'; status:'active'; createdAt?:string;
};
type UploadOptions = {
  module:NavstarStorageModule; recordId?:string; visibility?:'private'|'public';
  description?:string; signal?:AbortSignal; onProgress?:(percent:number)=>void;
};
type UploadUrlResponse = {intentId:string;uploadUrl:string;expiresAt:string;headers:Record<string,string>;error?:string};
type CompleteResponse = {file:NavstarStoredFile;error?:string};

function xhrPut(url:string,file:File,headers:Record<string,string>,signal?:AbortSignal,onProgress?:(percent:number)=>void){
  return new Promise<void>((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    const abort=()=>{xhr.abort();};
    if(signal?.aborted){reject(new DOMException('Upload cancelled.','AbortError'));return;}
    signal?.addEventListener('abort',abort,{once:true});
    xhr.open('PUT',url,true);
    Object.entries(headers).forEach(([key,value])=>xhr.setRequestHeader(key,value));
    xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress?.(Math.round(event.loaded/event.total*100));};
    xhr.onload=()=>{signal?.removeEventListener('abort',abort);if(xhr.status>=200&&xhr.status<300){onProgress?.(100);resolve();}else reject(new Error('Private storage rejected the upload (HTTP '+xhr.status+').'));};
    xhr.onerror=()=>{signal?.removeEventListener('abort',abort);reject(new Error('The upload connection was interrupted. Check your connection and retry.'));};
    xhr.onabort=()=>{signal?.removeEventListener('abort',abort);reject(new DOMException('Upload cancelled.','AbortError'));};
    xhr.send(file);
  });
}

export async function uploadNavstarFile(file:File,options:UploadOptions):Promise<NavstarStoredFile>{
  const intentResponse=await fetch('/api/storage/upload-url',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({module:options.module,recordId:options.recordId,fileName:file.name,mimeType:file.type,size:file.size,visibility:options.visibility||'private',description:options.description||''}),
    signal:options.signal
  });
  const intent=await intentResponse.json() as UploadUrlResponse;
  if(!intentResponse.ok||!intent.uploadUrl||!intent.intentId)throw new Error(intent.error||'A secure upload link could not be created.');
  try{
    await xhrPut(intent.uploadUrl,file,intent.headers||{'Content-Type':file.type},options.signal,options.onProgress);
    const completed=await fetch('/api/storage/complete',{
      method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({intentId:intent.intentId}),signal:options.signal
    });
    const result=await completed.json() as CompleteResponse;
    if(!completed.ok||!result.file)throw new Error(result.error||'The uploaded file could not be verified and registered.');
    return result.file;
  }catch(cause){
    await fetch('/api/storage/cancel',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({intentId:intent.intentId})}).catch(()=>undefined);
    throw cause;
  }
}
