export const adminHtml=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Answer questions — Insight</title><style>
body{font:17px/1.6 Georgia,serif;color:#202020;background:#fff;max-width:760px;margin:48px auto;padding:0 20px}h1,h2{font-weight:400}article{border-top:1px solid #ddd;margin-top:28px;padding-top:20px}p{white-space:pre-wrap;overflow-wrap:anywhere}textarea{box-sizing:border-box;width:100%;min-height:150px;padding:12px;font:inherit;border:1px solid #bbb}button{font:inherit;padding:7px 14px;margin:12px 12px 0 0;cursor:pointer;background:#f6f8fa;border:1px solid #aebdc7;color:#244f6c}label{display:block;margin:16px 0 8px}.meta{font-size:14px;color:#626262}.notice{min-height:1.6em}button:focus-visible,textarea:focus-visible{outline:2px solid #244f6c;outline-offset:3px}</style></head><body><h1>Answer questions</h1><p>Signed-in owner area. Your answers appear publicly on Insight. Hiding a question removes it and its answer from the public board.</p><p id="status" class="notice" role="status"></p><main id="questions"></main><button id="more" type="button" hidden>Load more</button><script src="/admin/app.js" defer></script></body></html>`;

// Keep browser code as source text: serializing a bundled function with toString()
// can capture references to Wrangler's build helpers that do not exist in browsers.
export const adminScript = String.raw`(() => {
  const list=document.getElementById('questions'),status=document.getElementById('status'),more=document.getElementById('more');
  let cursor=null;
  const node=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
  async function api(path,body) {
    const response=await fetch(path,{credentials:'same-origin',headers:body?{'Content-Type':'application/json','X-Insight-Admin':'1'}:{},method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});
    if(response.redirected || !(response.headers.get('content-type')||'').includes('application/json')) throw new Error('Your sign-in expired. Reload this page to sign in again.');
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||'The action could not be completed.');
    return data;
  }
  function question(item) {
    const article=document.createElement('article');
    const meta=node('p',(item.name||'A reader')+' · '+new Date(item.createdAt).toLocaleDateString()+(item.hidden?' · Hidden':''),'meta');
    article.append(meta,node('p',item.question));
    const form=document.createElement('form'),label=node('label','Your public answer'),input=document.createElement('textarea');
    input.id='answer-'+item.id;label.htmlFor=input.id;input.value=item.answer||'';input.required=true;input.maxLength=12000;
    const save=node('button',item.answer?'Update answer':'Publish answer');save.type='submit';
    const hide=node('button',item.hidden?'Restore question':'Hide question');hide.type='button';
    const result=node('p','','notice');result.setAttribute('role','status');
    form.append(label,input,save,hide,result);article.append(form);
    form.addEventListener('submit',async event=>{event.preventDefault();save.disabled=true;result.textContent='Saving…';try{await api('/admin/api/questions/'+item.id,{operation:'answer',answer:input.value});result.textContent=item.hidden?'Answer saved. The question remains hidden.':'Answer published.';save.textContent='Update answer';}catch(error){result.textContent=error.message;}finally{save.disabled=false;}});
    hide.addEventListener('click',async()=>{hide.disabled=true;try{await api('/admin/api/questions/'+item.id,{operation:item.hidden?'show':'hide'});item.hidden=!item.hidden;hide.textContent=item.hidden?'Restore question':'Hide question';meta.textContent=(item.name||'A reader')+(item.hidden?' · Hidden':'');result.textContent=item.hidden?'Question hidden from the public board.':'Question restored.';}catch(error){result.textContent=error.message;}finally{hide.disabled=false;}});
    return article;
  }
  async function load() {
    more.disabled=true;status.textContent='Loading questions…';
    try{const data=await api('/admin/api/questions'+(cursor?'?cursor='+encodeURIComponent(cursor):''));data.questions.forEach(item=>list.append(question(item)));cursor=data.nextCursor;more.hidden=!cursor;status.textContent=list.childElementCount?'':'No questions yet.';}catch(error){status.textContent=error.message;}finally{more.disabled=false;}
  }
  more.addEventListener('click',load);load();
})();`;
