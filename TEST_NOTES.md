# Yolcu doğrulama notları

14 Kasım 2026. Ön yüz derlemesiz bir PWA’dır. Son turda YapayZekaLab ve resmî eczane verisi için Node sunucu katmanı eklendi; `npm start` ikisini birlikte çalıştırır.

## Tamamlanan değişiklikler

- Gündüz sıcak kırık beyaz, gece grafit yüzeyler ve bakır vurgu. Üç panel durumu, büyük dokunma alanları, ayrı rota seçimi ve sürüş hiyerarşisi.
- Gerçek OpenFreeMap bina tabanları/yükseklikleri, yönlü ışık, yol sınıflarını ayıran palet ve daha az etiket. Trafik çizgileri seçili bakır rotanın yanına alınır. Sürüşte standart harita kullanılır; uydu gezinmede seçenek olarak korunur.
- Sessiz varsayılanla üç ses modu. Sessiz açılış, navigasyon başlangıcı ve uygulamaya dönüşte AudioContext oluşturulmaz, sessiz konuşma oynatılmaz, `playback` oturumu açılmaz. Sesler yalnız ihtiyaç anında hazırlanır ve tamamlanınca bırakılır. Destek varsa sesler için `ambient` istenir. Görünmez sayfada mevcut ses durdurulur.
- Başlangıçta güncel ve yeterince doğru konum kontrolü. Kamera hareketi aracı taşımaz; araç, ilerleme ve kamera ortak eşleşmiş konumu kullanır. GPS doğruluğu, yol yönü ve geçmiş ilerleme eşleştirmeye katılır. Rotadan uzakta gerçek koordinat korunur, ilerleme/varış zorlanmaz; zayıf GPS yeniden rota tetiklemez. Duruşta yön korunur, elle sürükleme takibi bırakır.
- Her ilk planlama ve yeniden hesaplamada aynı rahatlık ölçütleri ve ek süre sınırı. Başlangıç değerinin 5 dk olması kullanıcı tarafından değiştirilebilir. Etiketler doğrulanmış yol oranı/dönüş/eğim karşılaştırmalarından üretilir; bilinmeyen veri olumlu etiket olmaz.
- Tamamlanmış yolculuk tarihi, başlangıcı, hedefi, gerçek süresi, izlenen mesafesi ve güzergâhı saklanır. Önizlemeler gerçek geçmişe eklenmez. Son aramalar ayrı tutulur. Yolculuk ve güzergâh favorileri, kaçınılan kesimler ve tercihler yedeğe dahildir. Favoriden tekrar giderken eski güzergâhtan geçme adayı da süre sınırı içinde değerlendirilir.

## Çalıştırılan kontroller

- `npm run check`: tüm JS dosyalarının sözdizimi, HTML kimlikleri ve service worker uygulama dosyaları.
- `npm test`: sessiz ses politikası, uyarı ömrü, konuşmayı susturma, trafikli süre üst sınırı, eksik veri etiketleri, eşleştirme, duruş yönü, gerçek rota dışı konum, kötü GPS, zaman damgası dönüşümü ve yedekleme kontrolleri.
- Playwright: Chromium ve WebKit; 320×568, 390×844, 430×932 ekranlarında rota başlatma düğmesi, ayarlar, sessiz açılış/dönüş, araç-kamera ayrımı, takibi bırakma/ortalama, varış kaydı, favoriler, kaçınılan yolların yeniden açılışta korunması, önizlemelerin geçmişten ayrı kalması ve yerel telefon önizlemesinde üç ekran geçişi.
- Yerleşik @Browser: ana ekran → rota seçimi → koyu sürüş ekranı sırasıyla açıldı ve referansla görsel karşılaştırıldı. Telefon önizlemesi açık bırakıldı.
- Canlı Valhalla: Karabağlar test noktası → Bornova için üç farklı rota ve gerçek yol analizi alındı. Bu kontrolde en hızlı rota 2110,591 sn; rahat rota 2167,019 sn; fark 56,428 sn. En hızlı güzergâh 18,9 km, önerilen 30,8 km; yol/eğim/dönüş tercihleri nedeniyle daha uzun mesafeli çevre yolu seçilebiliyor. Bunlar sabit uygulama verisi değildir.
- Canlı kaçınma kontrolü: önerilen rotanın üzerindeki test noktası dışlandı; yeni alternatiflerin en yakını bile o noktadan yaklaşık 590 m uzakta kaldı. Önceki güzergâhın o noktadan geçtiği geometriyle kontrol edildi.

## TomTom canlı doğrulaması — 14 Kasım 2026

- 17:35 İstanbul saati kontrolü: aramada 10 sonuç, yakın akaryakıt aramasında 25 sonuç, İzmir kutusunda 169 trafik olayı; trafik karosu HTTP 200 ve 23.202 bayt.
- Üç Valhalla alternatifi için TomTom canlı süreleri alındı ve geometri eşleşmesi doğrulandı. Bu anlık kontrolde önerilen güzergâh 1.764 sn / 30,8 km, ikinci alternatif 2.127 sn / 18,9 km idi; trafik değiştikçe uygulama bu değerleri yeniden hesaplar.
- @Browser içinde gerçek Kahve Dünyası şubeleri/adresleri ve canlı trafik etiketli rota kartı açıldı. Kartta gecikme ve kontrol saati gösterilir.
- TomTom başka bir güzergâh döndürürse süre reddedilir. Bazı alternatiflerin trafik verisi alınamazsa bütün karşılaştırma ortak Valhalla sürelerine döner ve canlı trafik alınamadığı belirtilir; farklı kaynaklardan süreler karıştırılmaz.
- İşletme aramasında sağlayıcılar ayrı ayrı sonuç gösterebilir; yavaş bir servis hazır TomTom sonuçlarını bekletmez. Eski sorgular iptal edilince sonuçları yeni aramayı değiştirmez.
- Anahtar tarayıcıda yalnız `yolcu.tomtom.v1` yerel kaydında tutulur; normal uygulama ve geliştirme önizlemesi bu kaydı ortak kullanır. JSON yedeğine ve simge/paylaşım bağlantısına dahil edilmez. CLI testi için depo dışındaki, erişimi 0600 olan kullanıcı yapılandırması kullanılır; kaynaklarda veya test örneklerinde anahtar bulunmaz.
- Tekrarlama: `node tools/check-tomtom.mjs`. Güvenli özet rapor `artifacts/tomtom-live-check.json` içine yazılır; bu klasör Git tarafından dışlanır. Komut anahtarı veya istek URL'lerini yazdırmaz.
- Ek regresyonlar: eşleşmeyen trafik geometrisinin reddi, kısmi servis hatasında ortak süre tabanı, yetki/kota hatalarının anahtarsız mesajları ve yedek/paylaşım bağlantısının anahtar içermemesi.

## Bilinen sınırlar

- iPhone/Bluetooth müzik karıştırması, Dinamik Ada ve gerçek GPS sürüşü bu ortamda fiziksel cihazla test edilemedi. WebKit otomasyonu gerçek iPhone/Bluetooth testi yerine geçmez.
- PWA, iOS'ta arka planda sürekli konum garantisi vermez. Ön planda ekran açıkken kullanılır. Sesli anonsun başka uygulamaları nasıl etkilediği iOS/Bluetooth sürümüne bağlıdır; native AVAudioSession kontrolü PWA'da yoktur.
- Otomobil profilinde desteklenmeyen `use_hills` gönderilmez. Yokuşlar dönen alternatiflerin `max_upward_grade` / `max_downward_grade` yüzdeleriyle karşılaştırılır; `weighted_grade` enerji katsayısıdır, yüzde olarak kullanılmaz. Eksik veri işaretleri kapsam dışında tutulur; sıralama, tüm olası yollar arasında mutlak yokuşsuz rota garantisi değildir. Canlı İzmir analizinde sıfır olmayan eğim verisi doğrulandı.
- `exclude_unpaved`, bozuk yol tercihi açıkken otomobil profilinde kullanılır. Ek olarak bilinen yüzeyler sıralamaya katılır. OSM'de bulunmayan çukur/bozuk asfalt bilgisi çıkarılamaz; `paved_smooth` etiketi yolun bugün kusursuz olduğuna dair bir garanti değildir.
- Kaçınılan yol noktası/kesim örnekleri Valhalla'nın en yakın yol kenarlarını dışlar; tüm şehirde aynı adı taşıyan her yolu yasaklamaz. Başlangıç/hedefin dışlanan yol üzerinde olması rota bulunamamasına yol açabilir. Tüm kayıtlar Ayarlar → Kaçındığın yollar'dan silinebilir.
- TomTom anahtarıyla işletme araması, yakın işletmeler, olaylar, vektör trafik karoları, hızlı varış hesabı ve seçilen güzergâh için trafikli süre gerçek servislerde doğrulandı. Bluetooth üzerindeki anons etkisi yine fiziksel cihaz testi gerektirir.
- Bina ayrıntısı gerçek harita verisiyle sınırlı. Bu MapLibre sürümü gerçek cephe fotoğrafı veya fiziksel gölge üretmez. Yönlü ışık bina yüzlerini ayırır.
- Yolculuklar en son 40 kayıtla, favori güzergâhlar 20 kayıtla sınırlı. Depolama hatası görünür uyarı üretir. Tarayıcı verilerini silmeden önce JSON yedeği alınmalı.

## Telefonda kısa kabul testi

1. Bluetooth müziğini başlat. Yolcu'yu **Tamamen sessiz** modda aç, rota başlat; başka uygulamaya geçip geri dön. Müzik kesilmemeli ve Yolcu ses çalıyor gibi görünmemeli. Radar görünürken ses duyulmamalı.
2. **Yalnız uyarılar** seç; radar uyarısında kısa ses ve sonrasında müziğin devamını kontrol et. **Yönlendirme + uyarılar** modunda bir anons sonrasında müziğin normal düzeyine döndüğünü doğrula.
3. Güvenli bir sürüşte araç işaretinin yol üzerinde kalmasını ve duruşta yönünün oynamamasını kontrol et. Haritayı sürükle; konum sabit coğrafi noktada kalmalı, **Ortala** ile takip dönmeli. Gerçek rota dışına çıkıldığında araç eski rotaya yapışmamalı.
4. Bir yolculuğu tamamla, güzergâhı kaydet ve bir kesimi kaçınılanlara ekle. Uygulamayı kapat/aç: geçmiş ve tercihler durmalı. Kayıttan tekrar rota iste; kaçınılan kaydı Ayarlar'dan kaldırıp yeniden hesapla.

## Teknik dayanaklar

[Valhalla rota ve maliyet seçenekleri](https://valhalla.github.io/valhalla/api/route/api-reference/): otomobil/yaya profil ayrımı, `exclude_unpaved`, yol dışlamaları. [W3C Audio Session](https://www.w3.org/TR/audio-session/): karışabilen sesler için `ambient`, oynatma yaşam döngüsü. Bu API'nin desteklenmesi ve gerçek ses davranışı ayrıca cihazda doğrulanmalı.

[TomTom rota yeniden oluşturma ve trafik seçenekleri](https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route) · [Vektör trafik karoları](https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/vector-flow-tiles)

## Son geliştirme turu

Güncel senaryo tablosu, ölçülen gecikmeler, ara duraklar ve gerçek cihaz sınırları için [güvenilirlik raporu](RELIABILITY_REPORT.md). Önceki canlı süreler tarihli örneklerdir; bugünkü planlama sonuçları farklı olabilir.
