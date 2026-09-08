/* ⚠⚠⚠ FILE TỰ SINH — ĐỪNG SỬA Ở ĐÂY ⚠⚠⚠
   Nguồn: src/renderer/js/*.js — sửa ở đó rồi chạy: node tools/build-web-player.js
   Engine tương tác cho trang bài tập (§41). Trích thẳng mã nguồn app, không chép tay. */
'use strict';

/* ── rmcqPick — trích từ baigiang-soan.js ── */
function rmcqPick(el){
  const item=el.closest('.question-item'), opt=el.closest('.option-item');
  // câu đã chấm HOẶC đã hé lộ đáp án theo bước (§32.27.1) → khoá, không chọn đè lên đáp án nữa
  // (radio đã bị trình duyệt tích khi bấm ⇒ vẽ lại trạng thái đúng của câu, không để lệch)
  if(!item || item.dataset.graded) return;
  if(item.dataset.shown){ rmcqRevealItem(item, true); return; }
  item.dataset.picked=opt.dataset.oi;
  item.querySelectorAll('.option-item').forEach(o=>o.classList.remove('selected'));
  opt.classList.add('selected');
}

/* ── rmcqItems — trích từ baigiang-soan.js ── */
function rmcqItems(root){ return [...root.querySelectorAll('.question-item')]; }

/* ── rmcqRevealItem — trích từ baigiang-soan.js ── */
function rmcqRevealItem(item, on){
  const ans=+item.dataset.answer, picked=item.dataset.picked;
  if(on) delete item.dataset.graded;      // hé lộ GHI ĐÈ kết quả chấm của HV làm trên bảng (§32.27.3)
  item.querySelectorAll('.option-item').forEach(o=>{
    const oi=+o.dataset.oi, inp=o.querySelector('input');
    if(on){
      o.classList.remove('correct','incorrect');       // xoá màu chấm cũ rồi mới tô theo đáp án
      if(oi===ans){ o.classList.add('correct'); if(inp) inp.checked=true; }
      else if(picked!==undefined && +picked===oi) o.classList.add('incorrect');
    }else{
      o.classList.remove('correct','incorrect');
      // trả radio về đúng lựa chọn của người làm bài (không ai chọn → bỏ tích hết)
      if(inp) inp.checked = (picked!==undefined && +picked===oi);
    }
  });
  const exp=item.querySelector('.explanation-section');
  if(exp) exp.classList.toggle('show', !!on);
  if(on) item.dataset.shown='1'; else delete item.dataset.shown;
}

/* ── spkPick — trích từ baigiang-soan.js ── */
function spkPick(el){
  // câu đã chấm HOẶC đã hé lộ đáp án theo bước (§32.27) → khoá, không chọn đè lên đáp án nữa
  const item=el.closest('.question-item'); if(!item||item.dataset.graded||item.dataset.shown) return;
  item.dataset.picked=el.dataset.oi;
  item.querySelectorAll('.option-item').forEach(o=>o.classList.remove('selected'));
  el.classList.add('selected');
  const blank=item.querySelector('.spk-blank'), sp=el.querySelector('span');
  if(blank){ blank.textContent=sp?sp.textContent:''; blank.classList.add('filled'); }
}

/* ── wsPick — trích từ baigiang-soan.js ── */
function wsPick(el){
  if(el.classList.contains('graded')) return;
  el.classList.toggle('sel');
}

/* ── wcPick — trích từ baigiang-word-choice.js ── */
function wcPick(el){
  const slot=el.closest('.wc-slot'); if(!slot || slot.classList.contains('wc-graded')) return;
  slot.querySelectorAll('.wc-opt').forEach(o=>o.classList.remove('wc-sel'));
  el.classList.add('wc-sel');
  slot.dataset.picked=el.dataset.oi;
}

/* ── wireWordWeb — trích từ baigiang-soan.js ── */
function wireWordWeb(root){
  root.querySelectorAll('.ww-wrap.ww-live').forEach(wrap=>{
    if(wrap._wwWired) return; wrap._wwWired=true;
    let drag=null, ghost=null;
    const bank=wrap.querySelector('.ww-bank');
    // Bank DÙNG NHIỀU LẦN (gap-fill): chip trong bank là NGUỒN — kéo ra thì nhân bản, chip gốc ở lại để
    // dùng cho ô khác (đáp án trùng chỉ hiện 1 chip). Trả chip về bank = bỏ chip đó (bank vẫn còn bản gốc).
    const multi=!!(bank && bank.classList.contains('ww-bank-multi'));
    function moveGhost(e){ if(ghost){ ghost.style.left=e.clientX+'px'; ghost.style.top=e.clientY+'px'; } }
    function targetUnder(e){
      if(ghost) ghost.style.display='none';
      const el=document.elementFromPoint(e.clientX,e.clientY);
      if(ghost) ghost.style.display='';
      if(!el) return null;
      const cell=el.closest && el.closest('.ww-drop'); if(cell) return cell;
      if(el.closest && el.closest('.ww-bank')) return bank;
      return null;
    }
    function clearHot(){ wrap.querySelectorAll('.ww-drop-hot').forEach(c=>c.classList.remove('ww-drop-hot')); }
    function cleanup(){ if(ghost){ ghost.remove(); ghost=null; } if(drag) drag.classList.remove('ww-dragging'); drag=null; clearHot(); }
    wrap.addEventListener('pointerdown',e=>{
      const chip=e.target.closest && e.target.closest('.ww-chip');
      if(!chip || chip.classList.contains('locked')) return;
      e.preventDefault(); e.stopPropagation();
      const fromBank = multi && bank && bank.contains(chip);
      drag = fromBank ? chip.cloneNode(true) : chip;          // bank multi: kéo BẢN SAO, chip gốc ở lại bank
      const r=chip.getBoundingClientRect();
      ghost=chip.cloneNode(true); ghost.classList.add('ww-ghost'); ghost.classList.remove('ww-dragging');
      ghost.style.width=r.width+'px'; document.body.appendChild(ghost);
      if(!fromBank) chip.classList.add('ww-dragging');
      moveGhost(e);
      try{ wrap.setPointerCapture(e.pointerId); }catch(_){}
    });
    wrap.addEventListener('pointermove',e=>{
      if(!drag) return; e.preventDefault(); moveGhost(e);
      clearHot(); const t=targetUnder(e);
      if(t && t.classList.contains('ww-drop') && !t.querySelector('.ww-chip')) t.classList.add('ww-drop-hot');
    });
    function drop(e){
      if(!drag) return; e.preventDefault();
      let t=targetUnder(e);
      // Ô GV đã HÉ LỘ đáp án (§32.27.1) → khoá, không cho thả đè lên (chip trong đó là .locked).
      if(t && t.classList && t.classList.contains('ww-drop') && (t.dataset.shown || t.querySelector('.ww-chip.locked'))) t=null;
      if(t){
        if(t===bank){ if(multi) drag.remove(); else bank.appendChild(drag); }
        else if(t.classList.contains('ww-drop')){
          const occ=t.querySelector('.ww-chip');
          if(occ && occ!==drag){ if(multi) occ.remove(); else bank.appendChild(occ); }   // ô đã có chip → đẩy về bank (multi: bỏ hẳn)
          t.classList.remove('ok','bad'); t.appendChild(drag);
        }
        drag.classList.remove('ok','bad');
      }
      cleanup();
    }
    wrap.addEventListener('pointerup',drop);
    wrap.addEventListener('pointercancel',()=>cleanup());
  });
}

/* ── wireKp7 — trích từ baigiang-soan.js ── */
function wireKp7(root){
  root.querySelectorAll('.kp7-wrap.kp7-live').forEach(wrap=>{
    if(wrap._kp7Wired) return; wrap._kp7Wired=true;
    let drag=null, ghost=null, srcChip=null;              // srcChip = chip GỐC trong bảng (chỉ khi kéo TỪ bảng)
    const bank=wrap.querySelector('.kp7-bank');
    const ungray=si=>{ if(si==null||!bank) return; const s=bank.querySelector('.ww-chip[data-si="'+si+'"]'); if(s) s.classList.remove('used'); };
    function moveGhost(e){ if(ghost){ ghost.style.left=e.clientX+'px'; ghost.style.top=e.clientY+'px'; } }
    function targetUnder(e){
      if(ghost) ghost.style.display='none';
      const el=document.elementFromPoint(e.clientX,e.clientY);
      if(ghost) ghost.style.display='';
      if(!el) return null;
      const cell=el.closest && el.closest('.kp7-drop'); if(cell) return cell;
      if(el.closest && el.closest('.kp7-bank')) return bank;
      return null;
    }
    function clearHot(){ wrap.querySelectorAll('.kp7-drop-hot').forEach(c=>c.classList.remove('kp7-drop-hot')); }
    function cleanup(){ if(ghost){ ghost.remove(); ghost=null; } if(drag) drag.classList.remove('ww-dragging'); drag=null; srcChip=null; clearHot(); }
    wrap.addEventListener('pointerdown',e=>{
      const chip=e.target.closest && e.target.closest('.ww-chip');
      if(!chip || chip.classList.contains('used') || chip.classList.contains('locked')) return;
      e.preventDefault(); e.stopPropagation();
      const inBank = bank && bank.contains(chip);
      if(inBank){ srcChip=chip; drag=chip.cloneNode(true); drag.classList.remove('used'); }   // kéo BẢN SAO, chip bảng ở lại (sẽ tô mờ khi đặt)
      else { srcChip=null; drag=chip; }                                                        // kéo chip ĐÃ đặt (di chuyển / trả về)
      const r=chip.getBoundingClientRect();
      ghost=chip.cloneNode(true); ghost.classList.add('ww-ghost'); ghost.classList.remove('ww-dragging','used');
      ghost.style.width=r.width+'px'; document.body.appendChild(ghost);
      if(!inBank) chip.classList.add('ww-dragging');
      moveGhost(e);
      try{ wrap.setPointerCapture(e.pointerId); }catch(_){}
    });
    wrap.addEventListener('pointermove',e=>{
      if(!drag) return; e.preventDefault(); moveGhost(e);
      clearHot(); const t=targetUnder(e);
      if(t && t.classList && t.classList.contains('kp7-drop') && !t.querySelector('.ww-chip')) t.classList.add('kp7-drop-hot');
    });
    function drop(e){
      if(!drag) return; e.preventDefault();
      let t=targetUnder(e);
      // Ô đã được GV HÉ LỘ đáp án (§32.27.1) → khoá, không cho thả đè lên (chip trong đó là .locked).
      if(t && t.classList && t.classList.contains('kp7-drop') && (t.dataset.shown || t.querySelector('.ww-chip.locked'))) t=null;
      const dragSi = drag.dataset ? drag.dataset.si : null;   // si của chip đang kéo (đã đặt trước đó)
      if(t && t.classList.contains('kp7-drop')){
        const occ=t.querySelector('.ww-chip');
        if(occ && occ!==drag){ ungray(occ.dataset.si); occ.remove(); }   // ô đã có chip → trả nguồn của nó về bảng (gỡ mờ)
        t.classList.remove('ok','bad'); t.appendChild(drag); drag.classList.remove('ok','bad','ww-dragging');
        if(srcChip) srcChip.classList.add('used');            // tô mờ chip vừa kéo TỪ bảng
      }else{
        // thả về bảng hoặc ra ngoài: nếu đang kéo chip ĐÃ đặt → trả về bảng (gỡ mờ nguồn, bỏ chip)
        if(!srcChip){ ungray(dragSi); drag.remove(); }        // srcChip có = kéo mới từ bảng rồi hủy → clone tự biến mất
      }
      cleanup();
    }
    wrap.addEventListener('pointerup',drop);
    wrap.addEventListener('pointercancel',()=>cleanup());
  });
}

/* ── wireReorder — trích từ baigiang-soan.js ── */
function wireReorder(root){
  root.querySelectorAll('.ro-wrap.ro-live').forEach(wrap=>{
    if(wrap._roWired) return; wrap._roWired=true;
    let drag=null, ghost=null, fromSrc=false;
    const src=wrap.querySelector('.ro-src');
    const sortedAfter=(el,i)=>[...src.querySelectorAll('.ro-card')].find(x=>x!==el && +x.dataset.i>i)||null;
    // Đoạn gốc bên trái LUÔN ở lại: khi 1 card được đặt vào ô phải, để lại BẢN MỜ (placeholder,
    // .ro-used .locked) ở đúng vị trí bên trái; card trả về trái → xoá bản mờ, card thật sáng lại.
    const phFor=i=>src.querySelector('.ro-card.ro-used[data-i="'+i+'"]');
    const mkPlaceholder=c=>{
      const p=c.cloneNode(true);
      p.classList.add('ro-used','locked'); p.classList.remove('ro-dragging','ok','bad','ro-drop-hot');
      src.insertBefore(p, sortedAfter(null,+c.dataset.i));
    };
    const toSrc=c=>{   // trả card về cột nguồn (sáng lại), chèn ĐÚNG vị trí theo nhãn (A<B<C…)
      const i=+c.dataset.i;
      const ph=phFor(i); if(ph) ph.remove();
      src.insertBefore(c, sortedAfter(c,i));
    };
    function moveGhost(e){ if(ghost){ ghost.style.left=e.clientX+'px'; ghost.style.top=e.clientY+'px'; } }
    function targetUnder(e){
      if(ghost) ghost.style.display='none';
      const el=document.elementFromPoint(e.clientX,e.clientY);
      if(ghost) ghost.style.display='';
      if(!el || !el.closest) return null;
      const drop=el.closest('.ro-drop'); if(drop) return drop;
      if(el.closest('.ro-src')) return src;
      return null;
    }
    function clearHot(){ wrap.querySelectorAll('.ro-drop-hot').forEach(c=>c.classList.remove('ro-drop-hot')); }
    function cleanup(){ if(ghost){ ghost.remove(); ghost=null; } if(drag) drag.classList.remove('ro-dragging'); drag=null; clearHot(); }
    wrap.addEventListener('pointerdown',e=>{
      const c=e.target.closest && e.target.closest('.ro-card');
      if(!c || c.classList.contains('locked')) return;
      e.preventDefault(); e.stopPropagation();
      drag=c; fromSrc=src.contains(c);
      const r=c.getBoundingClientRect();
      ghost=c.cloneNode(true); ghost.classList.add('ro-ghost'); ghost.classList.remove('ro-dragging');
      ghost.style.width=r.width+'px'; document.body.appendChild(ghost);
      c.classList.add('ro-dragging'); moveGhost(e);
      try{ wrap.setPointerCapture(e.pointerId); }catch(_){}
    });
    wrap.addEventListener('pointermove',e=>{
      if(!drag) return; e.preventDefault(); moveGhost(e);
      clearHot(); const t=targetUnder(e);
      if(t && t!==src && !t.querySelector('.ro-fixed')) t.classList.add('ro-drop-hot');
    });
    function drop(e){
      if(!drag) return; e.preventDefault();
      let t=targetUnder(e);
      // Ô GV đã HÉ LỘ đáp án (§32.27.1) → khoá, không cho thả đè lên.
      if(t && t.classList && t.classList.contains('ro-drop') && (t.dataset.shown || t.querySelector('.ro-card.locked'))) t=null;
      if(t===src) toSrc(drag);
      else if(t && !t.querySelector('.ro-fixed')){
        const occ=t.querySelector('.ro-card');
        if(occ && occ!==drag) toSrc(occ);                 // ô đích đã có câu → đẩy câu cũ về cột nguồn (sáng lại)
        drag.classList.remove('ok','bad'); t.appendChild(drag);
        if(fromSrc && !phFor(+drag.dataset.i)) mkPlaceholder(drag);   // kéo từ trái sang → để lại bản mờ bên trái
      }
      cleanup();
    }
    wrap.addEventListener('pointerup',drop);
    wrap.addEventListener('pointercancel',()=>cleanup());
  });
}

/* ── wireMatching — trích từ baigiang-soan.js ── */
function wireMatching(root){
  root.querySelectorAll('.mt-wrap.mt-live').forEach(wrap=>{
    if(wrap._mtWired) return; wrap._mtWired=true;
    let drag=null, ghost=null, from=null, gx=0, gy=0;      // from = ô đang kéo; gx/gy = lệch con trỏ↔góc thẻ lúc grab
    function moveGhost(e){ if(ghost){ ghost.style.left=(e.clientX-gx)+'px'; ghost.style.top=(e.clientY-gy)+'px'; } }
    function targetUnder(e){
      if(ghost) ghost.style.display='none';
      const el=document.elementFromPoint(e.clientX,e.clientY);
      if(ghost) ghost.style.display='';
      return (el&&el.closest)?el.closest('.mt-drop'):null;
    }
    function clearHot(){ wrap.querySelectorAll('.mt-drop-hot').forEach(c=>c.classList.remove('mt-drop-hot')); }
    function cleanup(){ if(ghost){ ghost.remove(); ghost=null; } if(drag) drag.classList.remove('mt-dragging'); drag=null; from=null; clearHot(); }
    wrap.addEventListener('pointerdown',e=>{
      const c=e.target.closest && e.target.closest('.mt-card');
      if(!c || c.classList.contains('locked')) return;
      e.preventDefault(); e.stopPropagation();
      drag=c; from=c.closest('.mt-drop');
      const r=c.getBoundingClientRect();
      gx=e.clientX-r.left; gy=e.clientY-r.top;             // GIỮ điểm nắm → ghost không nhảy về giữa thẻ
      ghost=c.cloneNode(true); ghost.classList.add('mt-ghost'); ghost.classList.remove('mt-dragging','mt-joined');
      ghost.style.width=r.width+'px'; ghost.style.height=r.height+'px'; document.body.appendChild(ghost);
      c.classList.add('mt-dragging'); moveGhost(e);
      try{ wrap.setPointerCapture(e.pointerId); }catch(_){}
    });
    wrap.addEventListener('pointermove',e=>{ if(!drag) return; e.preventDefault(); moveGhost(e);
      clearHot(); const t=targetUnder(e); if(t && t!==from) t.classList.add('mt-drop-hot'); });
    function drop(e){ if(!drag) return; e.preventDefault();
      let t=targetUnder(e);
      // Ô GV đã HÉ LỘ đáp án (§32.27.1) → khoá, không cho thả đè lên.
      if(t && t.classList && (t.dataset.shown || t.querySelector('.mt-card.locked'))) t=null;
      if(t){
        if(t!==from){
          const occ=t.querySelector('.mt-card');
          if(occ){ occ.classList.remove('mt-ok','mt-bad'); from.appendChild(occ); }  // hoán vị: thẻ đích về ô nguồn
          drag.classList.remove('mt-ok','mt-bad'); t.appendChild(drag);
          mtJoinRow(from, false);                          // hàng NGUỒN → tách ra (thẻ bị đẩy không tự dính)
        }
        mtJoinRow(t, true);   // hàng ĐÍCH LUÔN dính (kể cả thả TẠI CHỖ) → mate được cặp đúng bị đẩy vào passive
      }
      cleanup();
    }
    wrap.addEventListener('pointerup',drop);
    wrap.addEventListener('pointercancel',()=>cleanup());
  });
}

/* ── mtJoinRow — trích từ baigiang-soan.js ── */
function mtJoinRow(cell, on){ const row=cell&&cell.closest('.mt-row'); if(!row) return;
  row.classList.toggle('mt-joined', !!on && cell.dataset.ans!=null && cell.dataset.ans!==''); }

/* ── cwFocus — trích từ baigiang-crossword.js ── */
function cwFocus(el){
  const g=cwGridOf(el); if(!g) return;
  g.dataset.cx=el.dataset.x; g.dataset.cy=el.dataset.y;
  // Ô chỉ thuộc 1 hướng → tự chuyển hướng cho khớp (gõ xong nhảy đúng chiều của từ).
  if(cwDir(g)==='across' && el.dataset.ac==null && el.dataset.dn!=null) g.dataset.dir='down';
  else if(cwDir(g)==='down' && el.dataset.dn==null && el.dataset.ac!=null) g.dataset.dir='across';
  cwHi(g);
}

/* ── cwClick — trích từ baigiang-crossword.js ── */
function cwClick(el){
  const g=cwGridOf(el); if(!g) return;
  const k=el.dataset.x+','+el.dataset.y;
  if(g.dataset.lastxy===k && el.dataset.ac!=null && el.dataset.dn!=null){
    g.dataset.dir=(cwDir(g)==='across')?'down':'across'; cwHi(g);
  }
  g.dataset.lastxy=k;
}

/* ── cwKey — trích từ baigiang-crossword.js ── */
function cwKey(e,el){
  const g=cwGridOf(el); if(!g) return;
  const x=+el.dataset.x, y=+el.dataset.y, k=e.key;
  if(k==='ArrowLeft'||k==='ArrowRight'){ g.dataset.dir='across'; cwStep(g,x,y,k==='ArrowLeft'?-1:1,0,true); e.preventDefault(); cwHi(g); }
  else if(k==='ArrowUp'||k==='ArrowDown'){ g.dataset.dir='down';  cwStep(g,x,y,0,k==='ArrowUp'?-1:1,true); e.preventDefault(); cwHi(g); }
  else if(k==='Backspace'){
    e.preventDefault();
    if(el.value && !el.readOnly){ el.value=''; return; }
    const d=cwDir(g), p=cwStep(g,x,y, d==='across'?-1:0, d==='across'?0:-1, false);
    if(p && !p.readOnly) p.value='';
  }
  else if(k==='Delete'){ if(!el.readOnly) el.value=''; e.preventDefault(); }
  else if(k===' '){ const d=cwDir(g); cwStep(g,x,y, d==='across'?1:0, d==='across'?0:1, false); e.preventDefault(); }
  else if(k==='Tab'){ /* để trình duyệt tự chuyển ô */ }
}

/* ── cwIn — trích từ baigiang-crossword.js ── */
function cwIn(el){
  el.value=(el.value||'').normalize('NFC').toUpperCase().slice(-1);
  const g=cwGridOf(el); if(!g) return;
  if(el.value){ const d=cwDir(g); cwStep(g,+el.dataset.x,+el.dataset.y, d==='across'?1:0, d==='across'?0:1, false); }
  cwHi(g);
}

/* ── cwGoClue — trích từ baigiang-crossword.js ── */
function cwGoClue(el){
  const sl=el.closest('.sl'), g=sl&&sl.querySelector('.cw-grid'); if(!g) return;
  const m=/^(ac|dn)-(\d+)$/.exec(el.dataset.k||''); if(!m) return;
  g.dataset.dir=(m[1]==='ac')?'across':'down';
  const list=g.querySelectorAll('.cw-in[data-'+m[1]+'="'+m[2]+'"]');
  if(list.length){ list[0].focus(); if(list[0].select) list[0].select(); }
}

/* ── cwGridOf — trích từ baigiang-crossword.js ── */
function cwGridOf(el){ return el.closest('.cw-grid'); }

/* ── cwHi — trích từ baigiang-crossword.js ── */
function cwHi(g){
  g.querySelectorAll('.cw-cell.cw-hl,.cw-cell.cw-cur').forEach(c=>c.classList.remove('cw-hl','cw-cur'));
  const sl=g.closest('.sl');
  if(sl) sl.querySelectorAll('.cw-clue.cw-clue-on').forEach(c=>c.classList.remove('cw-clue-on'));
  if(g.dataset.cx==null) return;
  const el=cwAt(g,g.dataset.cx,g.dataset.cy); if(!el) return;
  const key=cwDir(g)==='across'?'ac':'dn', id=el.dataset[key];
  if(id!=null){
    g.querySelectorAll('.cw-in[data-'+key+'="'+id+'"]').forEach(i=>i.parentElement.classList.add('cw-hl'));
    const cl=sl&&sl.querySelector('.cw-clue[data-k="'+key+'-'+id+'"]');
    if(cl){ cl.classList.add('cw-clue-on'); if(cl.scrollIntoView) cl.scrollIntoView({block:'nearest'}); }
  }
  el.parentElement.classList.add('cw-cur');
}

/* ── cwDir — trích từ baigiang-crossword.js ── */
function cwDir(g){ return g.dataset.dir==='down'?'down':'across'; }

/* ── cwStep — trích từ baigiang-crossword.js ── */
function cwStep(g,x,y,dx,dy,scan){
  let nx=x+dx, ny=y+dy;
  for(let i=0;i<64;i++){
    if(nx<0||ny<0) return null;
    const t=cwAt(g,nx,ny);
    if(t){ t.focus(); if(t.select) t.select(); return t; }
    if(!scan) return null;
    nx+=dx; ny+=dy;
    if(!dx && !dy) return null;
  }
  return null;
}

/* ── cwAt — trích từ baigiang-crossword.js ── */
function cwAt(g,x,y){ return g.querySelector('.cw-in[data-x="'+x+'"][data-y="'+y+'"]'); }
