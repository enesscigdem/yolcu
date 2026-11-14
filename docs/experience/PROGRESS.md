# Yolcu — kalıcı ilerleme ve devam noktası

Temel: `dc9e562a14b33cfc198d64f397267cef8e956617` (GitHub main doğrulandı). Branch: `feat/yolcu-complete-experience`. İlk Yol üstü PR’ı tekrar yapılmadı; üzerine geliştirildi. **Main birleştirmesi, ortam yayını ve canlı dağıtım yapılmadı.**

## Kapsamın durumu

| İstenen alan | Kodda yapılanlar | Kabul sınırı |
|---|---|---|
| 1. Ana ekran / görsel bütünlük | Yeni ana ekran yerleşimi; ev/işte adres + kesilmeyen süre; ihtiyaç ve kişisel yer kartları; ortak tipografi/yüzey/ikon sistemi; doğal palet; sakin 3B binalar; ayrı arazi kontrolü | Gerçek bina yüksekliği/dokusu veriyle sınırlı; fiziksel iPhone görüntüsü yok |
| 2. Yol üstü / Yakında | 5 rota örnekleme noktası, en fazla 12 aday, aynı anda 3 hesap; tam yolculuk etkisine göre sıralama; 6 sonuç/sayfa; gerçek adaylar süre tamamlanmadan haritada; hesaplama sırasında seçimin ve beklemenin korunması; yeni tahmini varış | Bütün şehirde küresel optimum garantisi yok; yalnız hesaplanabilen adaylar kesinleşir |
| 3. Tüm geçişler | Arama → işletme → rota geri geçmişi; sorgu ve kaydırma korunur; ayarlar 6 alt bölüm + ayrı model ekranı; kişisel yer düzenlemesi çağıran yere döner; eski istekler iptal edilir | Fiziksel klavye/Safari geri hareketi ayrıca denenmeli |
| 4. Navigasyon | Konum okunun görseli, yol talimatları, rota kartları, durak listesi; beklemeyi açıkça bitirme; iptal edilen devam et işleminin eski durak/beklemeyi başka yolculuğa taşımaması | FixStream, eşleme ve Replanner motoru korunmuştur; görünüm ve süre değişiklikleri cihaz onayı ister |
| 5. ETA | Tek saniye/zaman tabanı; manevra/özet uyumsuzluğu koruması; eski trafik örneği kullanılmaz; kalan trafik bütün rotaya yazılmaz; bekleme ve park sonrası yürüyüş bir kez sayılır; favoride açıklamasız %15 azaltma kaldırıldı | **Tarihî 19 km / 3:44 kök nedeni kanıtlanmadı.** [İnceleme](ETA.md) |
| 6. AI ve anahtar güvenliği | Gerçek hesap kataloğu; seçim/arama/kilit/hata durumları; tercih dosyasında yalnız model kimliği; TomTom aynı kaynaklı sunucu vekilinde; eski tarayıcı anahtarları kaldırılır; AI yokken yerel çözümleme ve navigasyon sürer | HTTPS backend kurulumu hazırlanmıştır, yayınlanmadı. [Backend](BACKEND.md) |
| 7. iPhone / erişilebilirlik / performans | 320–440 CSS px; açık/koyu tema; safe-area; 44 px eylemler; yakınlaştırma engeli kaldırıldı; reduced-motion; yavaş çizimde erken ve gerçek katman azaltma | Headless Chromium/WebKit gerçek iPhone, Bluetooth, PWA veya uzun sürüş onayı değildir |
| 8. Kişisel asistan | İhtiyaçları rota etkisiyle değerlendirme; yakıt/marka tercihleri, kayıtlı yerler, ev/iş, hatırlatmalar, araç girişi, park ve geçmiş korunur; birincil akışta gereksiz alanlar açılır seçeneklere taşındı | Yakıt stoğu, doluluk, bilinmeyen saat veya modelden yer bilgisi uydurulmaz |

## Commit ve doğrulama günlüğü

- `e33359c`: ortak uygulama yüzeyleri, geniş durak karşılaştırması, süre katmanı, sunucuya ait trafik/AI, ilk ekran geçmişi ve model ekranı. Bu noktada 55 birim testi, 9 Yol üstü ve 6 yeni akış testi geçti.
- İkinci geliştirme dilimi: ayar bilgi mimarisi, kişisel yerler/ev-iş düzenleme dönüşü, gerçek varış/duraklama ve park yürüyüşü, iptal edilen devam et bağlamı, ilerleyen işletme hesaplamaları, çizim uyarlaması ve isteğe bağlı arazi. Hash için `git log --oneline`.
- Son birim/kod kontrolü çıktıları `artifacts/experience/unit-final.txt` ve kontrol komutlarında. Son tam tarayıcı turu bu dosyanın devamında kaydedilecek; eski bir turun sonucu yeni commit için tam geçiş sayılmaz.
- Önceki geniş Chromium turu: 23 senaryo, 21 geçti; önizleme yükleme süresi ve çizim örneği kontrolü başarısız oldu. Önizleme, servis işlemini bekleyen 20 sn sınırla geçti; performans eşiği düşürülmedi, gerçek katman azaltma sonrası geçti.
- Önceki geniş WebKit turu: 25 senaryo, 24 geçti; yeniden yüklemede görüntü çözümleme erişim hatası görüldü. Worker denemesi çözüm olmadığından kaldırıldı. Arazi/DEM’nin binalardan ayrılmasından sonra ilgili yolculuk/geçmiş senaryosu değişmeyen hata beklentisiyle geçti. Son kararlı kod tekrar sınanacak.
- Son hedefli yeni akış turu: kişisel yer düzenlemesi/çağıran ayarlara dönüş, süre beklenirken gerçek harita adayları ve ileri-geri seçimin korunması, kişisel tercihlerin kalıcılığı: 3/3 geçti.

## Gerçek servis kanıtı

- Mevcut gizli değişkenler kullanıldı; değerleri yazdırılmadı veya istemciye taşınmadı.
- YapayZekaLab gerçek hesap kataloğu: **25 model**. Önceki raporda tercih edilen `gemini-3-flash` katalogda bulundu ve seçildi; tercih dosyası yalnız model kimliği içerir. Açık motorin + kahve test cümlesi `fuel` / `cafe` verdi, tek örnekte yaklaşık 1,9 sn.
- TomTom aynı kaynaklı vekilinden Konak araması HTTP 200 / 1 sonuç. Yeniden başlatılmış backend’de durum, katalog ve arama kontrolleri de HTTP 200.
- Anahtarsız canlı Valhalla kontrolü tamamlandı. 18,89 km güzergâh yaklaşık 2110,591 sn (35,18 dk); 3:44 yeniden üretilemedi.
- Bunlar bütün modellerin, bütün trafik uçlarının, tüm şehirlerin veya fiziksel navigasyonun doğrulandığı anlamına gelmez.

## Tekrar üretme

```sh
cd /workspace/yolcu
npm run check
npm test
NODE_USE_ENV_PROXY=1 npm start
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npm run test:e2e -- --project=chromium --timeout=90000
node tools/audit-timing.mjs
NODE_USE_ENV_PROXY=1 node tools/live-check.mjs
```

Bu makinede WebKit’in sistem kütüphane kaydı eksikti. İmzalı Debian trixie dizininden doğrulanan paketler depo dışındaki `/workspace/.cache/test-webkit` konumuna açıldı; browser binary değiştirilmedi. Bağımlılıklar `ldd` ile doğrulandı. Resmî Playwright `pw_run.sh` WPE başlatıcısı, desteklenen `executablePath` seçeneğiyle kullanılıyor:

```sh
YOLCU_WEBKIT_EXECUTABLE=/workspace/.cache/ms-playwright/webkit-2388/pw_run.sh \
PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright \
npm run test:e2e -- --config=tools/playwright-webkit.config.js --timeout=90000
```

Normal bir makinede Playwright’ın desteklenen sistem bağımlılıkları kurulmuşsa standart `--project=webkit` komutu kullanılmalıdır. TLS, paket imzası ve checksum doğrulaması kapatılmadı. Bu yerel test hazırlığı ortam taslağına veya kurulum script’ine uygulanmadı.

Görseller: `tools/capture-experience.mjs before 4175` (değişmez main arşivi) ve `after 4173`. Gerçek uygulama, kayıtlı açık İzmir rota/işletme örnekleri ve gerçek harita; 440×956 CSS px; Europe/Istanbul. Bunlar fiziksel iPhone fotoğrafı değildir.

## Açık kalan dış doğrulamalar / engeller

1. Tarihî 3:44 oturumunun aynı anda kaydedilmiş süre bileşenleri yok. Kesin kök neden hâlâ açık; kanıtlanmamış bir düzeltme tamamlandı diye bildirilmez.
2. iPhone 16 Pro Max ve küçük iPhone’da Safari/PWA safe-area, klavye, ses/Bluetooth, GPS kaybı/dönüşü, yeniden rota, ETA ve en az 40 dakikalık gerçek sürüş/oturum onayı yok. Bu nedenle canlıya çıkarılmamalı.
3. Sürekli çalışan, kimliği doğrulanan HTTPS backend için kullanıcı alan adı/DNS/işletim kararı gerekir. Yapılandırma ve servis örnekleri hazır; yayın yapılmadı. Pages’in sunucu çalıştırmadığı gizlenmez.
4. OSM’de eksik bina yüksekliği, işletme adresi, stok, saat ve doluluk üretilmez. Daha ayrıntılı harita sağlayıcısı seçeneği kalite/lisans/bölgesel kapsam kararıdır; sahte doku eklenmedi.
5. Çalışan ortamın gözlemlenen ağ politikası `restricted`; `api.github.com` izinli değil. Git okuma/gönderme çalışır. Gerçek PR oluşturma engeli sürerse branch + hazır PR metni kaydedilecek; PR varmış gibi bağlantı verilmeyecek.

## Sonraki görev nereden devam etmeli?

İlk Yol üstü PR’ını veya bu dosyadaki tamamlanan kodları tekrar yazma. Branch’in son commit’ini ve nihai doğrulama bölümünü oku. Önce kalan cihaz kabulünü, tarihî ETA kanıtını ve PR erişim engelini ele al. Yeni sorun çıkarsa yalnız ilgili davranışı değiştir ve etkilenen kontrolleri tekrar çalıştır.
