using System;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace GordaoMod
{
    public class ApiClient
    {
        private const string API_URL = "https://rack-gordao.onrender.com/api/validate";
        private const string PING_URL = "https://rack-gordao.onrender.com/api/ping";

        public class ValidateResponse
        {
            public bool ok;
            public string error;
            public string type;
            public long? expires_at;
            public string payload;
        }

        private static bool ParseBool(string json, string key)
        {
            var match = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(true|false)");
            if (match.Success) return match.Groups[1].Value == "true";
            return false;
        }

        private static string ParseString(string json, string key)
        {
            var match = Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"([^\"]*)\"");
            if (match.Success) return match.Groups[1].Value;
            return null;
        }

        private static string BuildJson(string key, string hwid)
        {
            return "{\"key\":\"" + key + "\",\"hwid\":\"" + hwid + "\"}";
        }

        private static void WakeServer()
        {
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                var pingReq = (HttpWebRequest)WebRequest.Create(PING_URL);
                pingReq.Method = "GET";
                pingReq.Timeout = 90000;
                pingReq.ReadWriteTimeout = 90000;
                using (var resp = (HttpWebResponse)pingReq.GetResponse()) { }
            }
            catch { }
        }

        public static ValidateResponse ValidateKey(string key, string hwid)
        {
            int maxRetries = 3;
            for (int attempt = 0; attempt < maxRetries; attempt++)
            {
                try
                {
                    ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

                    if (attempt == 0)
                        WakeServer();

                    string json = BuildJson(key, hwid);
                    byte[] bytes = Encoding.UTF8.GetBytes(json);

                    var request = (HttpWebRequest)WebRequest.Create(API_URL);
                    request.Method = "POST";
                    request.ContentType = "application/json";
                    request.Timeout = 90000;
                    request.ReadWriteTimeout = 90000;
                    request.ContentLength = bytes.Length;

                    using (var stream = request.GetRequestStream())
                    {
                        stream.Write(bytes, 0, bytes.Length);
                    }

                    using (var response = (HttpWebResponse)request.GetResponse())
                    using (var stream = response.GetResponseStream())
                    using (var reader = new System.IO.StreamReader(stream))
                    {
                        string result = reader.ReadToEnd();
                        return new ValidateResponse
                        {
                            ok = ParseBool(result, "ok"),
                            error = ParseString(result, "error"),
                            type = ParseString(result, "type"),
                            payload = ParseString(result, "payload")
                        };
                    }
                }
                catch (WebException ex)
                {
                    if (ex.Response != null)
                    {
                        try
                        {
                            using (var stream = ex.Response.GetResponseStream())
                            using (var reader = new System.IO.StreamReader(stream))
                            {
                                string result = reader.ReadToEnd();
                                return new ValidateResponse
                                {
                                    ok = ParseBool(result, "ok"),
                                    error = ParseString(result, "error")
                                };
                            }
                        }
                        catch { }
                    }

                    if (attempt < maxRetries - 1)
                    {
                        Thread.Sleep(3000);
                        continue;
                    }
                    return new ValidateResponse { ok = false, error = "Erro de conexao: " + ex.Message };
                }
                catch (Exception ex)
                {
                    if (attempt < maxRetries - 1)
                    {
                        Thread.Sleep(3000);
                        continue;
                    }
                    return new ValidateResponse { ok = false, error = "Erro: " + ex.Message };
                }
            }
            return new ValidateResponse { ok = false, error = "Falha apos varias tentativas" };
        }
    }
}
