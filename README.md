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

## Dữ liệu lưu ở đâu?

Chỉ lưu trong trình duyệt của bạn (localStorage), không gửi lên server nào.
Vì vậy:

- Đừng commit file backup JSON lên repo public, vì file đó chứa số tiền thật.
- Code trong repo này không chứa số tiền của bạn.
- Xóa dữ liệu trình duyệt thì mất dữ liệu, nên nhớ xuất file backup định kỳ.

## Đưa lên GitHub Pages

1. Tạo repo mới trên GitHub, upload 3 file `index.html`, `style.css`, `app.js` lên nhánh chính.
2. Vào Settings → Pages → Build and deployment → Deploy from a branch → chọn nhánh chính, thư mục `/ (root)` → Save.
3. Đợi vài phút rồi mở đường link GitHub Pages mà GitHub cấp.

Sau này muốn nâng cấp thì có thể thêm, theo thứ tự từ dễ đến khó:
danh mục con, mục tiêu từng danh mục, tự lấy giá vàng/crypto/cổ phiếu, rồi mới tới đồng bộ cloud.
