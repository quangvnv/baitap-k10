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
