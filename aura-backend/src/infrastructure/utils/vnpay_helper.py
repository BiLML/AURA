import hashlib
import hmac
import urllib.parse

class VNPay:
    requestData = {}
    responseData = {}

    def get_payment_url(self, vnp_Url, secret_key):
        """
        Tạo URL thanh toán gửi sang VNPay.
        Hàm này sẽ sắp xếp các tham số theo thứ tự bảng chữ cái, 
        nối chuỗi và mã hóa HMAC-SHA512 bằng secret_key.
        """
        inputData = sorted(self.requestData.items())
        queryString = ""
        hasData = ""
        seq = 0
        for key, val in inputData:
            if seq == 1:
                encoded_val = urllib.parse.quote_plus(str(val))
                queryString = queryString + "&" + key + "=" + encoded_val
            else:
                seq = 1
                encoded_val = urllib.parse.quote_plus(str(val))
                queryString = key + "=" + encoded_val

        hashValue = self.__hmacsha512(secret_key, hasData)
        return vnp_Url + "?" + queryString + "&vnp_SecureHash=" + hashValue

    def validate_response(self, secret_key):
        """
        Kiểm tra tính toàn vẹn của dữ liệu trả về từ VNPay.
        Hàm này lấy tất cả tham số vnp_ trả về, tái tạo chuỗi mã hóa 
        và so sánh với vnp_SecureHash xem có khớp không.
        """
        vnp_SecureHash = self.responseData.get('vnp_SecureHash')
        
        # Loại bỏ các tham số hash để chuẩn bị tính toán lại
        if 'vnp_SecureHash' in self.responseData:
            self.responseData.pop('vnp_SecureHash')
            
        if 'vnp_SecureHashType' in self.responseData:
            self.responseData.pop('vnp_SecureHashType')

        inputData = sorted(self.responseData.items())
        hasData = ""
        seq = 0
        
        for key, val in inputData:
            # Chỉ lấy các tham số bắt đầu bằng vnp_
            if str(key).startswith('vnp_'):
                if seq == 1:
                    hasData = hasData + "&" + str(key) + "=" + urllib.parse.quote_plus(str(val))
                else:
                    seq = 1
                    hasData = str(key) + "=" + urllib.parse.quote_plus(str(val))

        hashValue = self.__hmacsha512(secret_key, hasData)
        
        # So sánh chữ ký tính được với chữ ký VNPay gửi về
        return vnp_SecureHash == hashValue

    def __hmacsha512(self, key, data):
        byteKey = key.encode('utf-8')
        byteData = data.encode('utf-8')
        return hmac.new(byteKey, byteData, hashlib.sha512).hexdigest()