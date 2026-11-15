# Yolcu sunucusu ve YapayZekaLab bağlantısı

> **Geliştirme branch’i için güncel rehber:** [güvenli backend mimarisi](docs/experience/BACKEND.md). Aşağıdaki 14 Kasım notları önceki sürümün tarihsel doğrulamasıdır. Güncel sürümde katalog Ayarlar → Yapay zekâ ve modeller ekranında doğrudan alınır; seçim ayrı `ai-preferences.json` dosyasına yalnız model kimliği olarak yazılır. TomTom sunucu vekilindedir; tarayıcıya anahtar girilmez.

14 Kasım 2026. Ön yüzün 2026.11.14.1 sürümü GitHub Pages için hazırlandı. Model ve resmî eczane API katmanı henüz internete dağıtılmadı; Pages üzerinde bu kontroller açıklamalı olarak devre dışıdır. Yerel geliştirme sunucusu çalışıyor. `npm start` Node 22+ ile statik uygulamayı ve aynı kaynaktaki küçük API katmanını birlikte sunar. Model çağrıları GPS, kamera ve yeniden rota hesaplamasının parçası değildir.

## Yerel yapılandırma

Depo dışındaki `~/.config/yolcu/ai.json` (izin `0600`) kullanılır:

```json
{
  "baseURL": "https://yapayzekalab.org/v1",
  "model": "gemini-3-flash",
  "key": "BURAYA_YALNIZ_YEREL_GERCEK_ANAHTAR"
}
```

Gerçek anahtar bu örnekte yoktur. Mevcut kullanıcı anahtarı özel dosyaya zaten kondu; hesabın model listesi ve iki adayın sohbet çağrıları canlı doğrulandı. `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` ortam değişkenleri dosyadan önceliklidir. Model ortam değişkeniyle sabitlenmişse uygulamadaki model değiştirme bunu geçersiz kılmaz.

Ayarlar → YapayZekaLab → **Bağlantıyı test et** hesap anahtarıyla `/models` çağırır. **Modeli uygula**, seçilen kimliğin hesap kataloğunda bulunduğunu doğrulayıp sunucu dosyasına kaydeder. Anahtar tarayıcıya geri dönmez. Komut çözümleme `/chat/completions` ve JSON çıktısı kullanır. Sunucudaki izinli şema, modelin ürettiği mekân/koordinat/saat gibi ek alanları çıkarır. Sonuç seçmeden rota değişmez.

Yerel katman `/api/ai/status`, `/api/ai/test`, `/api/ai/model`, `/api/ai/interpret` ve `/api/duty` uçlarını sağlar. Dış kaynak istekleri reddedilir, AI çağrıları 12 saniyede kesilir ve dakikada 10 ile sınırlıdır. İptal edilen tarayıcı isteği sağlayıcı isteğini de iptal eder. Metin 1200 karakterle, yanıt ve önbellekler sınırlıdır. İstek metni ve kimlik bilgileri uygulama tarafından loglanmaz. Service worker API yanıtlarını saklamaz.

## Canlı model karşılaştırması

`node tools/benchmark-ai.mjs` yalnız genel test cümlelerini gönderir. 8 istek × 2 model denendi; ilk turda her ikisi nöbetçi eczaneyi normal eczane saydı (7/8). `duty` ayrımı yönergede açıklandıktan sonraki turda ikisi de 8/8 ve geçerli JSON üretti. Son turun medyanları Lite 1530 ms, Flash 1404 ms; bu küçük örneklemde Flash seçildi. Genel hız garantisi değildir. Girdi/çıktı tokenları ve katalog üzerinden tahmini maliyet raporda bulunur. Katalog fiyatının kaynak alanı boş; gerçek tahsilat dönmediği için kesin ücret karşılaştırması yapılmadı. Araç, park, GPS ve kişisel yer verileri bu teste gönderilmedi.

## Telefon ve HTTPS dağıtımı için gerekenler

Gerekenler: Node 22+ çalıştırabilen bir sunucu, kullanıcıya ait alan adı/DNS erişimi, HTTPS sonlandırıcı, erişim kimlik doğrulaması ve sunucuda gizli değer saklama imkânı. Bu makinenin `127.0.0.1` adresi telefonda bu makineyi göstermez. Statik GitHub Pages tek başına gizli anahtarlı API çalıştıramaz.

Hazır ters vekil örneği: [Caddyfile.example](server/Caddyfile.example). Node yalnız `127.0.0.1` üzerinde dinler. Caddy kimlik doğrulamasından sonra `X-Yolcu-Gateway` başlığını kendi sunucu sırrıyla **yeniden yazar**; kullanıcıdan gelen değere güvenmez. Node servisine `APP_ORIGIN=https://yolcu.example.com` ve en az 32 karakterlik `YOLCU_GATEWAY_TOKEN` verilir. Aynı sır Caddy ortamında tutulur. `YOLCU_USER` ve Caddy için üretilen `YOLCU_PASSWORD_HASH` ayrıca gerekir. Dış erişim yapılandırılırken kişisel anahtarın bulunduğu dosya ya da ortam sırrı sunucuya ayrı taşınır; kaynak depoya konmaz. Bu örnek yapılandırma hazırlanmıştır; gerçek alan adı, sertifika ve erişim hesabı bu oturumda kurulmadı.

[Sağlayıcı belgeleri](https://yapayzekalab.org/en/docs) ve canlı `/v1/models`, Umber'daki aktarıcının kullandığı Bearer + Chat Completions yapısıyla uyumlu. Yolcu sağlayıcıya doğrudan **sunucudan** gider; Umber'ın tarayıcıda anahtar tutan yöntemini kopyalamaz. [Caddy kimlik doğrulaması](https://caddyserver.com/docs/caddyfile/directives/basic_auth) ve [ters vekil başlıkları](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) dağıtım örneğinin dayanağıdır.
