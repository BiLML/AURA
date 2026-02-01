import hashlib
import hmac
import urllib.parse

class VNPay:
    requestData = {}
    responseData = {}

    def get_payment_url(self, vnp_Url, secret_key):
        """
        Tạo URL thanh toán gửi sang VNPay.
        SỬA LỖI: Dùng trực tiếp queryString để hash vì nó đã chứa dữ liệu được mã hóa chuẩn.
        """
        inputData = sorted(self.requestData.items())
        queryString = ""
        seq = 0
        for key, val in inputData:
            if seq == 1:
                # Mã hóa value tham số (ví dụ: dấu cách thành +, : thành %3A)
                encoded_val = urllib.parse.quote_plus(str(val))
                queryString = queryString + "&" + key + "=" + encoded_val
            else:
                seq = 1
                encoded_val = urllib.parse.quote_plus(str(val))
                queryString = key + "=" + encoded_val

        # [QUAN TRỌNG] Hash chính cái chuỗi queryString vừa tạo
        hashValue = self.__hmacsha512(secret_key, queryString)
        
        return vnp_Url + "?" + queryString + "&vnp_SecureHash=" + hashValue

    def validate_response(self, secret_key):
        vnp_SecureHash = self.responseData.get('vnp_SecureHash')
        
        # Loại bỏ các tham số hash để tính toán lại
        if 'vnp_SecureHash' in self.responseData:
            self.responseData.pop('vnp_SecureHash')
            
        if 'vnp_SecureHashType' in self.responseData:
            self.responseData.pop('vnp_SecureHashType')

        inputData = sorted(self.responseData.items())
        hasData = ""
        seq = 0
        
        for key, val in inputData:
            if str(key).startswith('vnp_'):
                if seq == 1:
                    hasData = hasData + "&" + str(key) + "=" + urllib.parse.quote_plus(str(val))
                else:
                    seq = 1
                    hasData = str(key) + "=" + urllib.parse.quote_plus(str(val))

        hashValue = self.__hmacsha512(secret_key, hasData)
        return vnp_SecureHash == hashValue

    def __hmacsha512(self, key, data):
        byteKey = key.encode('utf-8')
        byteData = data.encode('utf-8')
        return hmac.new(byteKey, byteData, hashlib.sha512).hexdigest()