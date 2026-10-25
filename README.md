# Sổ tài sản của tôi

Tool web nhỏ để theo dõi tổng tiền hiện tại và các khoản đầu tư đang có.

## Cách dùng

- Mở `index.html` là dùng được ngay, không cần cài đặt, không cần đăng nhập.
- Thêm khoản: tên, danh mục, số tiền quy đổi ra VND ở thời điểm hiện tại, ghi chú nếu cần.
- Danh mục mặc định: Tiền mặt, Tiết kiệm, Quỹ, Vàng, Crypto.
  Muốn thêm danh mục mới thì cứ gõ tên mới vào ô Danh mục là xong, không cần sửa code.
- Muốn đổi danh mục mặc định thì sửa mảng `DEFAULT_CATEGORIES` trong `app.js`.
- Bấm “Chốt thời điểm hiện tại” mỗi tuần hoặc mỗi tháng để lưu lịch sử tổng tài sản.
- Bấm “Xuất file JSON” để backup hoặc chuyển sang máy khác, rồi dùng “Nhập file JSON” để khôi phục.

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
