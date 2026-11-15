# Yayın günlüğü — 15 Kasım 2026

Hedef sürüm: **2026.11.15.1**, kod commit’i `c78cc0e`.

Kullanıcı, mevcut geliştirmeleri yeterli kabul ederek commit/push, kritik kontrol, main birleştirmesi ve GitHub Pages yayını istedi. Önceki “yalnız geliştirme branch’i” kısıtı bu yayın isteğiyle değişti. Gerçek iPhone sürüş doğrulaması yapılmış gibi sunulmaz.

## Yayına hazırlık

- Önceki `e33359c`, `88d951a`, `6e106c3` ve devam geliştirmeleri korundu.
- Birim testleri 59/59; kod/HTML/SW kontrolü başarılı.
- Tam Chromium 32/32 (`d1fe98f`); son giriş/klavye akışları 6/6 (`91114cf`).
- Tam WebKit 33/33 (`91114cf`); son yüzey düzeltmesi Chromium 3/3, WebKit 3/3 (`5677406`).
- Yayın numarası ve yeni SW önbelleği `c78cc0e` ile hazırlandı. Açık sürüş oturumuna zorla SW güncellemesi yapılmaz.
- Son kontrollerde doğrulanmış kritik bir uygulama hatası bulunmadı. Tarihî 3:44 kök nedeni, fiziksel iPhone GPS/ETA/Bluetooth/uzun sürüş ve HTTPS backend işletimi hâlâ açık doğrulamalardır.

## GitHub / Pages erişimi

Git branch gönderimi çalışıyor. PR oluşturma/listeleme isteği `Post https://api.github.com/graphql: Forbidden` ile engellendi. Pages adresine gerçek HTTP kontrolü de `CONNECT tunnel failed, response 403` / HTTP kodu `000` verdi. Ortamın kısıtlı izin listesinde `api.github.com` ve `enesscigdem.github.io` yok. Bu sonuçlar uygulamanın canlıda hata verdiği anlamına gelmez; bu ortamın ilgili hedeflere erişemediğini gösterir.

PR oluşturulmuş veya Pages doğrulanmış gibi bildirilmez. Main Git üzerinden birleştirme/push denemesinin kesin sonucu bu günlüğe ayrıca eklenecek. Repo koruması reddederse zorla gönderimle aşılmayacak.

Yayın hedefi: https://enesscigdem.github.io/yolcu/

GitHub Pages statiktir: güvenli Node backend bu yayınla dağıtılmaz. AI, TomTom ve resmî nöbetçi uçları Pages’te bağlı görünmez; anahtarsız harita/rota/arama ve cihazda komut çözümleme devam eder. Gerçek anahtarlar tarayıcıya taşınmaz.
