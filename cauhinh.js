/* Cấu hình kết nối Supabase cho trang bài tập (§41.3).

   ⚠ HAI KHOÁ NÀY LÀ CÔNG KHAI THEO THIẾT KẾ của Supabase — nhúng vào trang web là đúng:
     · URL project và `anon` key ai xem mã nguồn trang cũng thấy được.
     · Chúng KHÔNG cho quyền gì cả: RLS chặn sạch `anon` trên mọi bảng (web/sql/01-schema.sql),
       và học viên chỉ đi qua Edge Function.

   ⚠ TUYỆT ĐỐI KHÔNG đặt `service_role` key vào file này hay bất kỳ file nào trong web/public/.
     Khoá đó đi xuyên RLS ⇒ lộ nó là mở toang cả CSDL, gồm cả bảng đáp án. Nó chỉ được phép nằm
     trong biến môi trường của Edge Function (Supabase tự cấp SUPABASE_SERVICE_ROLE_KEY). */
window.CAU_HINH = {
  url: 'https://czijkjddblewfpwmjgvk.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6aWpramRkYmxld2Zwd21qZ3ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMDA2MTEsImV4cCI6MjEwMzU3NjYxMX0.u1YHWfdoCoOVPApFjVSU3e39_32192H0nEhXNAapsT8',
};
window.CAU_HINH.fnUrl = (ten) => window.CAU_HINH.url + '/functions/v1/' + ten;
