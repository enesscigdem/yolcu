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
- **Rotadan çıkınca:** Önce seni aynı yola geri bağlamayı dener, ancak o çok uzarsa yeni rota çizer.
- **Bu yoldan beni geçirme:** Haritada bir yola basılı tut. Yolcu seni bir daha oradan geçirmez.
- **Neredeyim:** Cadde, mahalle, ilçe, hız, yön ve rakım gösterir. Navigasyonda hız limiti tabelası ve bulunduğun yolun adı görünür.
- **Hangi yoldan?** Rotayı metro hattı gibi gösterir (Yeşildere Caddesi › Altınyol › Ankara Caddesi) ve istersen sesli anlatır.
- **Radar:** OpenStreetMap’teki hız kameraları ve senin işaretlediklerin. Ses kapalıyken de kısa bir uyarı sesi çalar.
- **Trafik (TomTom anahtarıyla):** canlı yoğunluk, kaza/yol çalışması uyarıları, trafikli varış ve işletme arama.
- **Yürüyüş** modu (kısa mesafeler için), uydu görünümü, arazi gölgeleri, hava durumu.
- **Önizle:** Rotayı gitmeden önce sanal olarak sürüp görebilirsin.
- Ev, iş, favoriler, son kullanılanlar, açık/koyu tema ve yedek alma/geri yükleme.

Tüm kişisel veriler (ev, iş, favoriler) **sadece telefonda** saklanır. Kodda adres yoktur.

## Telefona kurulum

1. iPhone'da Safari ile sitenin adresini aç.
2. Paylaş düğmesine (□↑) dokun, sonra **Ana Ekrana Ekle**'yi seç.
3. Uygulamayı ana ekrandaki simgeden aç ve konum iznini ver.

> Navigasyon sırasında ekran açık kalır. iOS, web uygulamalarına arka planda konum vermediği için telefonu tutucuda ve ekranı açık kullan.

## Kullanılan ücretsiz servisler

| İş | Servis |
|---|---|
| Harita | [OpenFreeMap](https://openfreemap.org) + MapLibre GL |
| Rota, yol analizi | [Valhalla](https://valhalla1.openstreetmap.de) (FOSSGIS) |
| Arama | [Photon](https://photon.komoot.io), [Nominatim](https://nominatim.openstreetmap.org), TomTom (isteğe bağlı) |
| Radar | OpenStreetMap (Overpass) |
| Hava | [Open-Meteo](https://open-meteo.com) |
| Arazi / Uydu | [Mapterhorn](https://mapterhorn.com), Esri World Imagery |
| Veri | © OpenStreetMap katkıcıları |

Trafik dışındaki her şey anahtarsız ve üyeliksiz çalışır.

## Geliştirme

Derleme adımı yoktur, dosyalar olduğu gibi yayınlanır. Yerelde denemek için herhangi bir statik sunucu yeterli (ör. `npx serve .`).

Simgeler `node tools/make-icons.mjs` ile üretilir.

Dosyalar:
- `js/app.js`: arayüz ve akış
- `js/api.js`: rota, arama ve yol analizi
- `js/nav.js`: navigasyon motoru ve simülatör
- `js/guide.js`: Türkçe yönlendirme metinleri, ekler, güzergah özeti ve oklar
- `js/traffic.js`: TomTom trafik, olaylar ve işletme arama
- `js/radar.js`: radar verisi ve uyarı sesi
- `js/mapstyle.js`: Apple tarzı harita renkleri
- `sw.js`: çevrimdışı önbellek
