# Güvenli sunucu ve model bağlantısı

Bu dosya dağıtım hazırlığıdır; alan adı, servis kurulumu veya canlı yayın yapılmış olduğu anlamına gelmez.

## Mimari

Tarayıcı → aynı HTTPS kaynakta kimliği doğrulanan Caddy → yalnız loopback’te Node → YapayZekaLab / TomTom.

Harita/Valhalla/Photon/OSM gibi anahtarsız servisler mevcut işlevini korur. Ücretli servis anahtarları yalnız Node ortamında bulunur. `/api/traffic/` yalnız izin verilen TomTom yollarını/yöntemlerini kullanır; istemcinin `key` parametresi ve serbest hedef adresleri reddedilir. Sunucu anahtarı sadece sabit sağlayıcı hedefine eklenir. Yanıtlar no-store’dur; hata gövdeleri sağlayıcıdan doğrudan aktarılmaz. İstek ve yanıt büyüklüğü, süre ve hız sınırlıdır. TLS doğrulaması açıktır; yönlendirmeler izlenmez.

GitHub Pages üzerinde gizli anahtar veya sunucu çalıştırılamaz. Güvenli seçenek, **uygulamanın tamamını** aynı HTTPS alanında bu backend ile sunmaktır. Bu branch Pages’e uzak backend adresi, CORS istisnası veya tarayıcı anahtarı eklemez. Pages’te anahtarsız harita/rota ve cihazda istek çözümleme devam eder; sunucu özellikleri açıkça kullanılamaz görünür.

## Çalıştırma

- Node.js 22+ ve mevcut `npm ci` bağımlılıkları.
- [Ortam örneği](../../server/environment.example) değer adlarını içerir; gerçek sırlar depodan ayrı ve yalnız servis kullanıcısınca okunur tutulur. `APP_ORIGIN` gerçek HTTPS alanı, `YOLCU_GATEWAY_TOKEN` en az 32 karakter olmalıdır. Aynı gateway sırrı Caddy tarafından gelen başlığın üzerine yazılır. [Caddy örneği](../../server/Caddyfile.example) HTTP kimlik doğrulamasını TLS’in arkasında uygular.
- [Servis örneği](../../server/yolcu.service.example) `/srv/yolcu`, `/etc/yolcu/environment` ve `/var/lib/yolcu` yollarını kullanır. Kullanıcı/yollar/Node ikilisi kurulacağı makinede doğrulanmalıdır. Örnek otomatik kurulmaz/etkinleştirilmez.
- Yerel geliştirme: `NODE_USE_ENV_PROXY=1 npm start` (Node 24’ün yönetilen proxy desteği). Sunucu `127.0.0.1:4173` üzerinde dinler. Normal, doğrudan dış ağ erişimi olan Node 22 dağıtımında bu proxy seçeneği gerekmez.
- Sağlık: `/` HTML, `/api/services` yapılandırılmış servis adları, `/api/ai/status` anahtarsız durum, `/api/ai/models` hesabın güncel kataloğu. Durumda anahtarın mevcut olması sağlayıcı erişiminin kanıtı değildir; gerçek istek ayrıca sınanır.

## Model seçimi neden çalışmıyordu?

Eski istemci iki model adını sabit yazıyordu. Model kataloğu ancak ayrı testten sonra geliyordu; model adını içermeyen sağlayıcı yapılandırması katalog çağrısını da engelliyordu. Ayrıca `AI_MODEL` varsa sunucu uygulamadan seçimi 409 ile reddediyordu; arayüz bu kilidi önceden göstermiyordu.

Artık katalog model seçilmeden alınabilir. Çok kipli modeller yalnız `modality` alanı dizi diye kaybolmaz. Kimlikler sunucudan doğrulanır. `AI_MODEL` sabitse ekran açıklama ve kilitli seçim gösterir. Sabit değilse seçim `ai-preferences.json` içine atomik olarak **yalnız model kimliği** şeklinde yazılır; anahtar bu dosyaya kopyalanmaz. `AI_PREFERENCES_PATH` ile kalıcı ve yazılabilir konum seçilir. Sağlayıcı/model yetkisi ve kota hataları normal navigasyonu engellemez.

## Bu ortamda gerçekten doğrulananlar

Gizli değişkenlerin değerleri açığa çıkarılmadan mevcut bağlantılar kullanıldı. Gerçek katalog 25 model döndürdü. Önceki çalışmada tercih edilen `gemini-3-flash` katalogda bulundu ve seçildi. Açık “Motorin alıp kahve içmek istiyorum” cümlesi model üzerinden `fuel` ve `cafe` olarak çözüldü; tek istekte yaklaşık 1,9 saniye. TomTom için Konak araması aynı kaynaklı vekilden HTTP 200 ve bir sonuç döndürdü. Bunlar bütün modellerin, trafik karolarının veya fiziksel navigasyonun doğrulandığı anlamına gelmez.

## Yayın öncesi

HTTPS alanı/DNS, Caddy erişim hesabı, gateway sırrı ve sunucu sürecinin sürekliliği işletmeci tarafından sağlanmalıdır. Gerçek iPhone/Safari/PWA ile GPS, ETA, ses/Bluetooth, yeniden rota, safe-area ve uzun oturum doğrulaması gereklidir. Servis worker yeni sürümü açık sürüş oturumunun ortasında zorla etkinleştirmez; normal tarayıcı bekleme yaşam döngüsünü kullanır.
