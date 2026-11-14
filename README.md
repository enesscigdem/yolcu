# Yolcu

Seni **rahat yoldan** götüren navigasyon. iPhone'da Safari'den açılıp ana ekrana eklenerek kullanılır.

## Ne yapar?

- **Rahat rota:** En kısa süreye değil, en rahat yola bakar. Birkaç farklı rota ister ve hepsini yol parçası yol parçası inceler:
  - ana yol / otoyol oranı
  - dik yokuşlar (gerçek eğim verisi)
  - bozuk yüzeyli yollar
  - ara sokak miktarı ve dönüş sayısı
  
  Sonra en rahatını **Önerilen** olarak gösterir, en hızlıyla dürüstçe karşılaştırır.
- **Karıştırmayan yönlendirme:** Büyük ok, mesafe, eylem ("Sağdan çıkın"), yol tabelası (Buca, Bornova) ve "Ardından" uyarısı. Türkçe sesli uyarılar 3 aşamada gelir: erken, yakın ve "şimdi". Otoyolda önceden şerit uyarısı da verir.
- **Rotadan çıkınca:** İki güvenilir konumla sapmayı doğrular, eski manevrayı kaldırır ve güncel konumdan aynı tercihlerle yeniden rota ister. Eski yanıt yeni rotayı değiştiremez.
- **Bu yoldan beni geçirme:** Haritada bir yola basılı tut. Yolcu seni bir daha oradan geçirmez.
- **Neredeyim:** Cadde, mahalle, ilçe, hız, yön ve rakım gösterir. Navigasyonda hız limiti tabelası ve bulunduğun yolun adı görünür.
- **Hangi yoldan?** Rotayı metro hattı gibi gösterir (Yeşildere Caddesi › Altınyol › Ankara Caddesi) ve istersen sesli anlatır.
- **Radar:** OpenStreetMap’teki hız kameraları ve senin işaretlediklerin. Varsayılan tamamen sessiz modda yalnız görsel uyarı verir. Yalnız uyarılar veya yönlendirme + uyarılar ayrıca seçilebilir.
- **Trafik (TomTom anahtarıyla):** canlı yoğunluk, kaza/yol çalışması uyarıları, trafikli varış ve işletme arama.
- **Yürüyüş** modu (kısa mesafeler için), uydu görünümü, arazi gölgeleri, hava durumu.
- **Önizle:** Rotayı gitmeden önce sanal olarak sürüp görebilirsin.
- Ev, iş, favoriler, ayrı son aramalar ve tamamlanan yolculuklar, favori güzergâhlar, açık/koyu tema ve yedek alma/geri yükleme.

Ev, iş, favoriler, park konumu, geçmiş ve yol tercihleri cihazda saklanır. Gerçek rota ve arama için gerekli noktalar ilgili harita servislerine gönderilir. Modelle çözümlemeyi seçtiğinde yalnız yazdığın istek YapayZekaLab’a gider; GPS akışı modele gönderilmez.

## Telefona kurulum

Güncel statik yayın: <https://enesscigdem.github.io/yolcu/>. Sürüm: **2026.11.14.1** (Ayarlar → Hakkında).

GitHub Pages harita, rota, duraklar, park, geçmiş/favoriler ve cihazda yazılı komut çözümlemeyi sunar. Bu geliştirme branch’inde TomTom trafik ve işletme araması yalnız güvenli sunucu bağlantısıyla kullanılabilir; anahtar tarayıcıya girilmez. Mevcut statik yayının davranışı bu branch tarafından değiştirilmez. Anahtar yayına veya kaynak koda eklenmez.

Bu yayında sunucu henüz bağlı olmadığı için YapayZekaLab model çağrısı ve resmî nöbetçi eczane listesi kullanılamaz; arayüz bunu açıkça belirtir. Normal eczane ve diğer kategoriler kullanılabilir. Mac kapalıyken statik yayın çalışır; harita/rota/arama internet gerektirir.

1. iPhone'da Safari ile yukarıdaki HTTPS adresini aç.
2. Paylaş düğmesine (□↑) dokun, sonra **Ana Ekrana Ekle**'yi seç.
3. Uygulamayı ana ekrandaki simgeden aç ve konum iznini ver.

> Navigasyon sırasında ekran açık kalır. iOS, web uygulamalarına arka planda konum vermediği için telefonu tutucuda ve ekranı açık kullan.

## Kullanılan servisler

| İş | Servis |
|---|---|
| Harita | [OpenFreeMap](https://openfreemap.org) + MapLibre GL |
| Rota, yol analizi | [Valhalla](https://valhalla1.openstreetmap.de) (FOSSGIS) |
| Arama | [Photon](https://photon.komoot.io), [Nominatim](https://nominatim.openstreetmap.org), TomTom (isteğe bağlı) |
| Radar | OpenStreetMap (Overpass) |
| Hava | [Open-Meteo](https://open-meteo.com) |
| Arazi / Uydu | [Mapterhorn](https://mapterhorn.com), Esri World Imagery |
| Veri | © OpenStreetMap katkıcıları |

Temel harita ve rota anahtarsız çalışır. TomTom isteğe bağlı anahtar, YapayZekaLab sunucuda tutulan hesap anahtarı gerektirir. Nöbetçi eczaneler İzmir Belediyesi’nin resmî servisinden, tarih/saat koşullarıyla alınır.

## Geliştirme

Derleme adımı yoktur; dosyalar olduğu gibi yayınlanır. Node.js 22+ ile:

```sh
npm ci
npm start
```

Uygulama: <http://127.0.0.1:4173/>. Telefon önizlemesi: <http://127.0.0.1:4173/preview.html>.
Önizlemede üç ekran arasında geçiş yapılabilir; İzmir'deki açık test koordinatlarından **canlı servise** rota istenir ve sürüş simüle edilir. Yalnız localhost'ta etkinleşir, gerçek konum izni istemez ve `yolcu.preview.v1` adlı ayrı bir depolama alanı kullanır.

```sh
npm run check
npm test
npx playwright install chromium webkit
npm run test:e2e
node tools/live-check.mjs
node tools/check-tomtom.mjs # isteğe bağlı; yerel TomTom anahtarı gerektirir
```

TomTom anahtarı sunucunun `TOMTOM_API_KEY` ortam değişkeninde tutulur. Tarayıcı yalnız aynı kaynaktaki `/api/traffic/` vekilini kullanır; eski tarayıcı anahtar kayıtları temizlenir. CLI testi anahtarı `TOMTOM_API_KEY` ortam değişkeninden veya depo dışındaki `~/.config/yolcu/tomtom.json` dosyasından okur. Gerçek anahtarı kaynak dosyalarına yazmayın.

Tarayıcı testleri 14 Kasım 2026 tarihinde canlı Valhalla'dan kaydedilmiş açık İzmir güzergâhlarıyla tekrarlanabilir kontroller yapar; harita karoları ağdan yüklenir. `node tools/live-check.mjs --update-fixture` rota örneklerini yeniler. Güncel senaryo ve performans ölçümleri [güvenilirlik raporunda](RELIABILITY_REPORT.md); önceki servis doğrulamaları [doğrulama notlarında](TEST_NOTES.md).

Simgeler `node tools/make-icons.mjs` ile üretilir.

Dosyalar:
- `js/app.js`: arayüz ve akış
- `js/api.js`: rota, arama ve yol analizi
- `js/nav.js`: navigasyon motoru ve simülatör
- `js/audio.js`: üç ses modu, kısa ses oturumu ve sessizlik politikası
- `js/guide.js`: Türkçe yönlendirme metinleri, ekler, güzergah özeti ve oklar
- `js/traffic.js`: TomTom trafik, olaylar ve işletme arama
- `js/radar.js`: radar verisi ve uyarı sesi
- `js/mapstyle.js`: Apple tarzı harita renkleri
- `sw.js`: çevrimdışı önbellek


Geliştirme tanılaması önizlemedeki **Ölçümler** düğmesiyle açılır. Normal kullanımda gizlidir. Konum yaşı, uygulama işleme ve bir sonraki harita render olayına kadar geçen süre, RAF aralıkları ve ayrı yeniden rota süreleri gösterilir. RAF ölçümü GPU'nun gerçekten sunduğu karelerin ölçümü değildir.

```sh
node --expose-gc tools/replay-navigation.mjs
node tools/check-reroute.mjs
```

İkinci komut özel yerel anahtarla gerçek rota ve trafik servislerini çağırır; anahtar veya tam istek adresi yazdırmaz. Çıktılar Git dışındaki `artifacts/` klasörüne kaydedilir. Navigasyonda menüden benzinlik/otopark eklenebilir; ek süre tam başlangıç–durak–hedef rotasıyla hesaplanır. Varışta **Bu güzergâhı beğendim** aynı hedef için tercihi saklar; sonraki planlama bunu mevcut süre sınırı ve kapanma verisiyle yeniden değerlendirir.


**Yol üstü:** Yakıt, Migros/market, tekel, eczane/nöbetçi eczane, ATM, yemek, kahve, tuvalet, otopark, lastikçi ve akücü. Önce üç sonuç; ek sürüş gerçek tam rota farkından gelir, durakta kalma süresi ayrı seçilir. En fazla üç durak düzenlenebilir; sıralar yol ağı üzerinden karşılaştırılabilir. Parka araçla, ardından hedefe yürüyerek devam edilebilir. Motorin/marka tercihleri, kişisel Multinet işaretleri, asistans telefonu, hedefe bağlı hatırlatmalar ve araç girişleri yerelde tutulur. Saat/doluluk bilinmiyorsa açık veya müsait iddiası yapılmaz.

YapayZekaLab kurulumu, model testi, HTTPS dağıtım gereksinimleri ve Umber karşılaştırması: [Sunucu bağlantısı](SERVER_SETUP.md). Yerel komut çözümleme ve kategori düğmeleri model olmadan kullanılabilir. Mikrofon eklenmedi; yazıyla kullanım hazırdır.

## Bütün uygulama geliştirmesi (yayınlanmadı)

`dc9e562` üzerine yapılan geliştirme kapsamı, doğrulama ve kalan işler: [kalıcı ilerleme dosyası](docs/experience/PROGRESS.md). Bu branch gerçek iPhone onayı almamış geliştirme sürümüdür; main’e otomatik birleştirme veya telefon yayını yapılmaz. [Güvenli backend çalıştırma](docs/experience/BACKEND.md) tüm uygulamanın aynı HTTPS kaynaktan sunulmasını esas alır. GitHub Pages sunucu çalıştırmaz.
