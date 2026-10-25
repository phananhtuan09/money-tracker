# Sổ tài sản của tôi

Tool web nhỏ để theo dõi tổng tiền hiện tại và các khoản đầu tư đang có.

## Cách dùng

- Mở `index.html` là dùng được ngay, không cần cài đặt, không cần đăng nhập.
- App có 4 trang, chuyển qua sidebar (máy tính) hoặc thanh tab dưới cùng (điện thoại):
  - **Tổng quan**: tổng tài sản, chênh lệch so với lần chốt gần nhất, biểu đồ phân bổ, xu hướng và các khoản lớn nhất.
  - **Tài sản**: tìm kiếm (gõ không dấu cũng được), lọc theo danh mục, sắp xếp; bấm vào một khoản để sửa.
  - **Lịch sử**: biểu đồ và danh sách các lần chốt, kèm mức tăng/giảm giữa các lần.
  - **Cài đặt**: giao diện sáng/tối, ẩn số tiền, xuất/nhập file backup, xóa dữ liệu.
- Bấm “Thêm khoản” (hoặc phím `N`) để thêm: tên, số tiền quy đổi ra VND ở thời điểm hiện tại, danh mục, ghi chú nếu cần.
  Ô số tiền nhận cả kiểu gõ tắt như `500k`, `50tr`, `1,2ty`.
- Danh mục mặc định: Tiền mặt, Tiết kiệm, Quỹ, Vàng, Crypto.
  Muốn thêm danh mục mới thì cứ gõ tên mới vào ô Danh mục là xong, không cần sửa code.
- Muốn đổi danh mục mặc định thì sửa mảng `DEFAULT_CATEGORIES` trong `app.js`.
- Khoản nào quá 30 ngày chưa cập nhật sẽ có nhãn “Cần cập nhật”.
- Bấm “Chốt số liệu” mỗi tuần hoặc mỗi tháng để lưu lịch sử tổng tài sản. Chốt lại trong cùng ngày sẽ ghi đè lần chốt hôm đó.
- Xóa nhầm một khoản hoặc một lần chốt thì bấm “Hoàn tác” trên thông báo hiện ra.
- Nút con mắt ở góc trên che toàn bộ số tiền khi bạn mở app ở nơi đông người.
- Vào Cài đặt → “Xuất file JSON” để backup hoặc chuyển sang máy khác, rồi dùng “Nhập file JSON” để khôi phục.

## Đồng bộ giữa nhiều máy (GitHub Gist, có mã hóa)

Không bắt buộc. Bật trong Cài đặt → “Đồng bộ qua GitHub Gist”:

1. Tạo [fine-grained token](https://github.com/settings/personal-access-tokens/new):
   Expiration 90 ngày, Permissions → Account permissions → **Gists: Read and write**, không cần quyền repository nào.
2. Dán token, đặt mật khẩu đồng bộ (ít nhất 8 ký tự) rồi bấm Kết nối.
   Máy đầu tiên sẽ tạo một gist bí mật tên `so-tai-san.enc.json`.
3. Trên máy khác, nhập token của cùng tài khoản GitHub và **đúng mật khẩu đó**, app tự tìm gist đã có.

Cách hoạt động:

- Dữ liệu được mã hóa ngay trên trình duyệt (AES-GCM 256-bit, khóa sinh từ mật khẩu bằng PBKDF2-SHA256 600.000 vòng) rồi mới gửi lên Gist.
  Lộ token hay link gist cũng chỉ thấy chuỗi mã hóa.
- Máy chỉ lưu token và khóa đã sinh, không lưu mật khẩu. Token không nằm trong file backup JSON.
- Mỗi lần sửa, app tự đẩy lên sau khoảng 1,5 giây; khi mở lại tab hoặc có mạng lại thì tự kéo bản mới về.
- Nếu cả máy này và Gist cùng thay đổi, app hỏi bạn giữ bản nào chứ không tự ghi đè.
- “Xóa hết dữ liệu” sẽ ngắt đồng bộ trước, nên không xóa trắng dữ liệu trên Gist.
- Token hết hạn hoặc bị thu hồi: vào Cài đặt → “Đổi token”. Nghi lộ token thì thu hồi ngay ở GitHub → Settings → Developer settings.
- Quên mật khẩu đồng bộ thì không giải mã được dữ liệu trên Gist; dữ liệu trên máy và file backup vẫn còn.

## Dữ liệu lưu ở đâu?

Lưu trong trình duyệt của bạn (localStorage). Nếu bật đồng bộ thì có thêm một bản đã mã hóa trên Gist của bạn, ngoài ra không gửi đi đâu.
Vì vậy:

- Đừng commit file backup JSON lên repo public, vì file đó chứa số tiền thật.
- Code trong repo này không chứa số tiền của bạn.
- Xóa dữ liệu trình duyệt thì mất dữ liệu, nên nhớ xuất file backup định kỳ.

## Đưa lên GitHub Pages

1. Tạo repo mới trên GitHub, upload 4 file `index.html`, `style.css`, `app.js`, `sync.js` lên nhánh chính.
2. Vào Settings → Pages → Build and deployment → Deploy from a branch → chọn nhánh chính, thư mục `/ (root)` → Save.
3. Đợi vài phút rồi mở đường link GitHub Pages mà GitHub cấp.

Sau này muốn nâng cấp thì có thể thêm, theo thứ tự từ dễ đến khó:
danh mục con, mục tiêu từng danh mục, tự lấy giá vàng/crypto/cổ phiếu, rồi mới tới đồng bộ cloud.
