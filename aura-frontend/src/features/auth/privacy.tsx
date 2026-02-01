const PrivacyAndTerms = () => {
  return (
    <div style={{ padding: '40px', maxWidth: '900px', margin: '0 auto', lineHeight: '1.7', color: '#333', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>Chính sách và Điều khoản - Project AURA</h1>
      <p><em>Ngày cập nhật cuối cùng: 01 tháng 02 năm 2026</em></p>

      {/* 1. Chính sách quyền riêng tư */}
      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ color: '#007bff' }}>1. Chính sách quyền riêng tư (Privacy Policy)</h2>
        <p>Ứng dụng <strong>Project AURA</strong> sử dụng tính năng Đăng nhập qua Facebook để tối ưu hóa trải nghiệm người dùng. Chúng tôi cam kết bảo vệ thông tin cá nhân của bạn theo các tiêu chuẩn sau:</p>
        <ul>
          <li><strong>Dữ liệu thu thập:</strong> Chúng tôi chỉ yêu cầu quyền truy cập vào <strong>Họ tên (Name)</strong> và <strong>Địa chỉ Email</strong> từ tài khoản Facebook của bạn.</li>
          <li><strong>Mục đích sử dụng:</strong> Dữ liệu này được dùng duy nhất để định danh người dùng và lưu trữ kết quả trong hệ thống sàng lọc sức khỏe mạch máu võng mạc.</li>
          <li><strong>Bảo mật:</strong> Chúng tôi không chia sẻ, bán hoặc cung cấp thông tin của bạn cho bất kỳ bên thứ ba nào khác.</li>
        </ul>
      </section>

      {/* 2. Điều khoản dịch vụ */}
      <section style={{ marginBottom: '30px' }}>
        <h2 style={{ color: '#007bff' }}>2. Điều khoản dịch vụ (Terms of Service)</h2>
        <p>Bằng cách sử dụng AURA, bạn đồng ý với các điều khoản sau:</p>
        <ul>
          <li>Ứng dụng được cung cấp nhằm mục đích hỗ trợ sàng lọc sức khỏe, không thay thế cho chẩn đoán chuyên môn của bác sĩ.</li>
          <li>Người dùng chịu trách nhiệm bảo mật tài khoản cá nhân sau khi đăng nhập.</li>
        </ul>
      </section>

      {/* 3. Hướng dẫn xóa dữ liệu - QUAN TRỌNG NHẤT VỚI META */}
      <section style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', borderLeft: '5px solid #dc3545' }}>
        <h2 style={{ color: '#dc3545', marginTop: 0 }}>3. Hướng dẫn xóa dữ liệu (Data Deletion Instructions)</h2>
        <p>Theo quy định của Meta, chúng tôi cung cấp quy trình để bạn có thể xóa dữ liệu của mình bất kỳ lúc nào:</p>
        <ol>
          <li>Gửi email yêu cầu xóa tài khoản đến: <strong>traduongkiennguyen.ai.ml@gmail.com</strong>.</li>
          <li>Trong email, vui lòng cung cấp Tên hiển thị hoặc Email đã dùng để đăng nhập qua Facebook.</li>
          <li>Chúng tôi sẽ tiến hành xóa toàn bộ dữ liệu liên quan của bạn khỏi cơ sở dữ liệu (MongoDB/PostgreSQL) trong vòng 72 giờ làm việc và gửi phản hồi xác nhận.</li>
        </ol>
      </section>

      <footer style={{ marginTop: '50px', textAlign: 'center', fontSize: '0.9em', color: '#777' }}>
        <p>&copy; 2026 Project AURA - Developed for Educational Purposes</p>
      </footer>
    </div>
  );
};

export default PrivacyAndTerms;