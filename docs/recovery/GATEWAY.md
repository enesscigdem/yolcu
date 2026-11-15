# GitHub Pages için gerçek sunucu bağlantısı

Pages yalnız statik uygulamayı sunar. Tarayıcıya TomTom veya YapayZekaLab anahtarı vermeden bu servisleri kullanmak için ayrı bir HTTPS backend gerekir. `server/gateway` Cloudflare Workers üzerinde dağıtılabilecek uygulamadır; Node sunucusunun Pages'te çalışacağı varsayılmaz.

**Bu branch henüz bir public backend'e dağıtılmadı.** Kullanıcının hosting hesabı yok. Yerel Workers testi ve gerçek sağlayıcı HTTP sonuçları, public deployment veya fiziksel iPhone doğrulaması yerine geçmez.

## Hesap açıldıktan sonra dağıtım

Node >=22.12 kullan. Depo kökünde:

```sh
npm ci
npm run gateway:build
npx wrangler login
npx wrangler secret put APP_PASSWORD --config server/gateway/wrangler.jsonc
npx wrangler secret put SESSION_SECRET --config server/gateway/wrangler.jsonc
npx wrangler secret put TOMTOM_API_KEY --config server/gateway/wrangler.jsonc
npx wrangler secret put AI_API_KEY --config server/gateway/wrangler.jsonc
npm run gateway:deploy
```

Komutlar değerleri etkileşimli ister; anahtarları komuta, GitHub'a, sohbete veya ekran görüntüsüne yazma. APP_PASSWORD bu kişisel uygulamanın bağlantı parolasıdır (20–256 karakter). SESSION_SECRET ayrı, rastgele, en az 32 karakter olmalı. TomTom ve AI anahtarlarını sağlayıcı hesaplarından sunucu secret olarak ekle. Secrets Cloudflare hesabında saklanır; bu çalışma ortamındaki environment değişkenleri otomatik olarak Cloudflare'a taşınmaz.

Manifest `FRONTEND_ORIGIN=https://enesscigdem.github.io` kullanır. Origin bir path içermez; `/yolcu/` ekleme. Başka domain için manifesti güncelle. İlk deploy SQLite Durable Object migration'ını oluşturur. STATE hem hız sınırlarını hem seçilen model kimliğini kalıcı tutar; provider anahtarlarını burada saklamaz. Deploy ücret/limitlerini hesabında kontrol et. `AI_MODEL` isteğe bağlıdır; ayarlanırsa uygulama bunu açıkça gösterir ve model seçimini kilitler.

## Uygulamada bağlantı

1. Ayarlar → Trafik ve sunucu bağlantısı ekranına dağıtımın gerçek `https://…workers.dev` adresini ve APP_PASSWORD değerini gir. Provider anahtarlarını bu forma girme.
2. `/api/health` ve owner oturumu doğrulanır. Yalnız URL localStorage'a yazılır; 12 saatlik oturum sessionStorage'da tutulur. Kişisel yedek/verilere eklenmez. Sekme/PWA kapatılınca veya süre dolunca yeniden bağlantı gerekebilir.
3. Trafik bağlantısını gerçek servis isteğiyle dene. Yapay zekâ ve modeller ekranını aç: liste sağlayıcının hesabından alınmalı; bir model seç ve tekrar açınca seçimin korunduğunu doğrula. Servis flag'leri yalnız yapılandırmayı gösterir, sağlayıcı erişim kanıtı değildir.
4. iPhone Safari/PWA'da yakıt/market araması, canlı trafik katmanı, rota, ekran kilidi sonrası GPS toparlanması ve model seçimini ayrı ayrı dene. AI yokken rota ve ücretsiz OSM işletme araması devam etmeli.

## Güvenlik ve sınırlar

Gateway tek kullanıcılı kişisel kurulum içindir. CORS tam origin ile sınırlıdır; tek başına CORS yetkilendirme sayılmaz. Sağlayıcı istekleri imzalı oturum ister. Uygulama parolası ve session secret değiştirilerek oturumlar iptal edilebilir. Origin kontrolü, sürekli hız sınırı, istek/yanıt sınırları ve yalnız sabit sağlayıcıya izin veren proxy vardır. Başka URL'ye relay yok; provider redirect'leri takip edilmez. Oturum query string'e yazılmaz; MapLibre trafik tile'ları Authorization header kullanır ve bu header başka harita sağlayıcılarına eklenmez. İstek loglarına URL/query veya Authorization ekleme.

Bu bir çok kullanıcılı hesap sistemi değildir. Herkese açık hizmete dönüştürmeden önce kullanıcı bazlı kimlik, kota, maliyet takibi ve uygulama güvenliği ayrıca tasarlanmalı. PWA'da üçüncü taraf cookie gerektirmeyen CORS oturumu kullanılır; gerçek Safari doğrulaması hâlâ gereklidir.

## Tekrarlanabilir doğrulama

`npm test` gateway yetkilendirme, CORS, relay kısıtları ve model seçimini kontrollü yanıtlarla sınar. `npm run gateway:build` gerçek Worker bundle'ını üretir ve ortamda mevcut provider anahtarlarının bundle'a girmediğini kontrol eder. `npm run gateway:dev` yerel Workers çalışma ortamını açar; `.dev.vars.example` yalnız boş örnektir.

Bu bulutun HTTP proxy gereksinimi nedeniyle doğrudan yerel workerd dış servislere bağlanamaz. `tools/gateway-proxy-runtime.mjs` sadece testte workerd'in outbound isteklerini Node'un mevcut proxy/CA zincirinden geçirir; TLS ve ağ hedef politikalarını değiştirmez. Miniflare, kilitli Wrangler sürümünden gelir. Node otomatik açtığı sıkıştırmayı yeniden workerd'e bildirmemek için adapter content-encoding/length header'larını kaldırır. Production Worker bu adapter'ı içermez.

`tools/check-gateway-live.mjs` gerçek HTTP testi için owner parolasını repodan değil `GATEWAY_CHECK_CREDENTIAL_FILE` ile gösterilen özel JSON dosyasından okur (`{"password":"…"}`; dosya modu 0600). Varsayılan adres yerel 8788'dir. Public dağıtım sonrasında `GATEWAY_CHECK_URL` ve `GATEWAY_CHECK_ORIGIN` ile yeniden çalıştırılabilir. Çıktı token/anahtar/parola içermez. Trafik, işletme, model kataloğu ve bir metin yorumlama isteği gerçek sağlayıcıya gider; kotayı kullanır.

Main merge ve Pages yayını bu düzeltme görevinin kapsamında henüz yapılmaz; gerçek cihaz doğrulaması sonrası kullanıcı kararı gerekir.
