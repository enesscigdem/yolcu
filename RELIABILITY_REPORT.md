# Yolcu geliştirme ve güvenilirlik raporu

14 Kasım 2026, İstanbul. Ana ekran, rota seçimi, sürüş ve Yol üstü akışı mevcut projede geliştirildi. Yerel önizleme `http://127.0.0.1:4173/preview.html` açık tutuldu. GitHub'a gönderim ve dış sunucuya dağıtım yapılmadı.

## Çalışan geliştirmeler

- Sıcak zemin, ayrışan binalar, ölçülü yeşil alanlar ve grafit gece haritası. Yaklaşan yaklaşık 850 metrede rota koridorundaki binalar alçaltılır; diğer binalar harita verisindeki yüksekliklerle çizilir. Gidilen bölüm gri, kalan yol bakırdır. 2D/3D geçişleri yumuşatıldı.
- Araç ve ilerleme ortak, doğruluk/zaman/yön denetimli GPS akışını kullanır. Araç kamera merkezine sabitlenmez, ileri tahmin yapılmaz. Duruş gürültüsü tutulur. Kamera dönme hızı sınırlı; yeni kamera hareketi eskisini durdurur. Elle gezdirme takibi bırakır; Ortala geri getirir. Tüm rotada küçük işaret kullanılır.
- İki güvenilir ve farklı zamandaki ölçüm sapmayı doğrular; tek sıçrama hesaplama başlatmaz. Eski manevra saklanır, “Rota yenileniyor” gösterilir. Aynı tercih/kaçınma/duraklarla yeniden hesaplama, eski yanıtı reddetme, iptal ve 2–30 saniyelik kontrollü tekrar var.
- Yol üstü: Yakıt, Migros/market, tekel, eczane/nöbetçi eczane, ATM, yemek, kahve, otopark, tuvalet, lastikçi ve akücü. Mola ve Yardım alt grupları; ilk ekran kısayolları, motorin/marka ve asistans tercihleri düzenlenir. Yakıt seviyesi ve stok bilinmiyor.
- Önce üç aday; daha fazlası kullanıcı isteğiyle hesaplanır. Ek sürüş tam başlangıç–durak–hedef rotalarının farkıdır; kuş uçuşu yakınlığı nihai sıralama sayılmaz. Aday havuzu sınırlıdır, şehirdeki bütün işletmeler arasında küresel optimum iddiası yoktur. Saatler varış anında değerlendirilir; bilinmeyen saatler açık sayılmaz. Durakta kalma süresi ayrı seçilir ve ETA'ya ayrıca eklenir.
- Üç durağa kadar ekle/sırala/atla/kaldır; “en kısa süreli sıra” gerçek ağdaki en fazla altı sırayı karşılaştırır. Hedef yakınındaki otoparka otomobil ve sonrasında asıl hedefe yaya rotası hesaplanır. Park ettim kaydı, kat/bölüm/not ve Arabaya dön kalıcıdır. Normal sürüş önizlemesi gerçek park kaydını değiştirmez; yerel telefon önizlemesinin ayrı deposunda denenebilir.
- Ev, iş ve kayıtlı yerlere ayrı araç girişi atanabilir. Bu dönüşü istemiyorum yalnız o yolculuğa bir kaçınma noktası ekler. Beğenilen güzergâh, kişisel yerler, kişisel Multinet işareti ve hedefe bağlı hatırlatmalar kayıtlıdır. Multinet işareti sağlayıcı doğrulaması değildir.
- Ayarlar opak; boş geçmiş kompakt, Tümü gizli. Son aramalar erişilebilir, dar ekran düğmeleri kontrol edildi. Yeni alt panel açıkken kamera aracı panelin üstündeki harita alanına taşır; dönüş kartı görünür kalır. Tanılama normal kullanımda kapalıdır.

## Senaryo, beklenti ve sonuç

Tarayıcı senaryoları Chromium ve WebKit'te çalıştırıldı; 320×568, 390×844 ve 430×932 boyutları kullanıldı. Rota yanıtları açık İzmir noktalarından canlı Valhalla ile kaydedilmiş örnekler; GPS ve hata/zaman aşımı senaryoları sentetiktir. Harita karoları gerçek ağdan gelir.

| Senaryo | Beklenen | Gerçekleşen / ölçüm |
|---|---|---|
| Şehir içi, çevre yolu, düşük hız, dur-kalk | Akış ilerlesin, gereksiz yenileme olmasın | Her biri 600 mantıksal saniye; tüm ölçümler kabul, 0 beklenmeyen yenileme |
| 8 Hz hızlı iz | Gecikme birikmesin | 4800 örnek; en büyük boyuna hata 1,17 m; 0 beklenmeyen yenileme |
| 40 dk uzun mantıksal iz | Kaynaklar ve işleme büyümesin | 19.200 örnek; hata 0 m, tampon 600. GC sonrası fazlar 4,56 → 4,61 → 4,60 → 4,60 MB. Son p95 0,0075 ms; ilk faz p95 0,0096 ms |
| Tek GPS sıçraması, duruş gürültüsü, eksik yön | Sahte sapma/hareket oluşmasın | Tek sıçrama yeniden rota üretmedi; duruş yönü/konumu tutuldu; eksik yön gözlenen hareketten türetildi |
| Eski, ileri tarihli, kötü doğruluklu veya ters sıradaki GPS | İlerlemeyi değiştirmesin | Paylaşılan akış ölçümleri reddetti; GPS kaybında hareket durdu; yeni ölçümde devam etti |
| Bağlı yanlış sokak, kaçırılan çıkış, paralel yol, karşı yön | Eski rotaya zorla oturmasın | Ham koordinat korundu, iki güvenilir ölçümle sapma doğrulandı; testte fark etme 1000 ms |
| Döner kavşak, ardışık dönüş, kendi üzerinden geçen rota | Manevralar sıralı, ilerleme tutarlı olsun | Sıra/hata kontrolü geçti; yanlış erken varış oluşmadı |
| Köprü/zemin aynı yatay konumda | Kanıt yokken seviye uydurulmasın | Bilinen bridge/tunnel verisi ve geçmiş kullanıldı; belirsiz üst üste geometride eşleşme bekletildi |
| Canlı yeniden rota | Onay sonrası ≤1 sn'de başlasın; servis süresi ayrı olsun | Son gerçek servis denemesinde başlatma 0,163 ms, servis 962,527 ms, uygulama 962,552 ms; trafik ve manevralar geldi |
| Ağ hatası, yavaş servis, ters yanıt sırası | Hedef kalsın, son istek kazansın | 2 sn ilk tekrar, güncel tercihlerle tekrar; iptal edilen/eski yanıt uygulanmadı |
| Sürükle/Ortala/tüm rota/2D–3D | Takip ve işaret tutarlı olsun | İki motorda geçti; kamera oynarken işaret coğrafi konumunu korudu |
| Dört kez başlat/bitir | Kaynaklar birikmesin | Sonunda navigasyon zamanlayıcısı 0, simülatör yok, RAF kapalı, istek/tekrar yok, katman sayısı başlangıçla aynı |
| İki durak ve sıra değiştirme | Gerçek çok etaplı rota, tercih korunması | 3 etaplı kayıtlarla ekle, değiştir, atla geçti; kaçınma noktaları ve bozuk yol seçeneği isteklerde korundu |
| Arama/model sürerken yeniden rota | Eski sonuç yeni rotayı değiştirmesin | 14 sn gecikmeli sahte model açıkken GPS ilerledi. Kategori araması çalıştı; rota değişince eski seçenekler geçersizleştirildi |
| Kapalı/bilinmeyen saatler | Açık iddiası yapılmasın | Saat sınırları ve kapsanmayan tarih testleri geçti; açık filtresi bilinmeyeni dışladı |
| Nöbetçi eczane | Resmî tarih ve saat koşulları korunsun | Canlı serviste 73 güncel tarihli kayıt. Örnek rota için BAYRAM ECZANESİ: +507 sn sürüş, yaklaşık 1200 sn ulaşım; saat teyidi ve telefon açıkça gösterildi. Eski tarih, gece yarısı sınırı, icap nöbeti testleri geçti |
| Park → yürüyüş → kayıt | Modlar ve hedef tutarlı olsun | Canlı örnekte araç rotası 2372,441 sn; yaya rotası 1065,610 sn / 1352 m. Tarayıcıda açık kullanıcı eylemiyle geçiş, not ve yaya profili doğrulandı; fiziksel varış testi değil |
| Yeniden açılış | Geçmiş, güzergâh, park, marka, hatırlatma, Multinet işareti kalsın | İki motorda kalıcılık ve yedek kontrolleri geçti |
| Tamamen sessiz | Ses oturumu başlamasın | Birim/tarayıcı denemelerinde AudioContext, konuşma ve oturum çağrısı 0; gerçek müzik/Bluetooth sonucu ölçülmedi |
| Sunucu / anahtar | Anahtar istemciye ve kaynağa sızmasın | Farklı host/origin ve özel dosya yolları reddedildi; yalnız metin model isteğine gitti; 69 kaynak dosyasında iki gerçek anahtar için eşleşme 0; iki özel dosya 0600 |

47 birim testi geçti. Son geniş tarama 27/30 sonuç verdi; park testlerindeki güncel GPS taklidi ve simülasyon/gerçek park ayrımı düzeltildikten sonra ilgili iki senaryo iki motorda yeniden çalıştırıldı: 4/4 geçti. Böylece kapsamdaki 30 tarayıcı senaryosunun güncel düzeltmeleri doğrulandı. `npm run check` de geçti. Bu kayıt tam taramanın tek seferde hatasız bittiği iddiası değildir.

## Performansın sınırları

40 dakikalık iz **hızlandırılmış mantıksal zamandır**, 40 dakika süren telefon veya tarayıcı oturumu değildir. Yukarıdaki küçük CPU/bellek değerleri GPS motoruna ve Node test sürecine aittir; MapLibre, GPU, iPhone belleği veya uzun süreli sızıntısızlık kanıtı sayılmaz.

Yerleşik görünür tarayıcıda önceki 600 RAF örneğinin medyanı 16,7 ms, p95'i 17,8 ms; GPS işleme p95 3,4 ms, sonraki harita render olayına kadar p95 5,9 ms idi. RAF aralığı gerçek GPU sunumunun ölçümü değildir. Bu, iPhone 16 Pro Max'te 60 FPS ölçüldüğü anlamına gelmez.

Son otomasyon ölçümleri ve kontrollü iki fazlı karşılaştırma `artifacts/controlled-performance.json` içindedir.

Aynı ilk 88 metre, 390×844 WebKit, her faz 11 gerçek saniye / 8 Hz GPS / 600 RAF örneği:

| Durum | İşleme p95 | Sonraki harita render p95 | RAF medyan / p95 |
|---|---|---|---|
| Yalnız sürüş | 2 ms | 14 ms | 17 / 18 ms |
| Yol üstü + yavaş model | 3 ms | 14 ms | 17 / 19 ms |

Bu kısa karşılaştırmada model beklemek takip akışını durdurmadı; GPU sunumu, uzun oturum belleği ve gerçek cihaz sonucu ölçülmedi.

 Kısa stres testleri menü/rota uygulama sıçramalarını da içerir; Chromium headless bu makinede CVDisplayLink/SwiftShader uyarıları ve düşük kare hızı üretti. Önceki Chromium medyan 133,3 ms / p95 183,4 ms; yeni panel stresinde 50 ms / 66,6 ms ve azaltılmış yoğunluk görüldü. Farklı kesim ve yük nedeniyle buradan hızlanma iddiası çıkarılmaz. WebKit önce 17/25 ms, panel stresi 17/27 ms; işlem p95 2 ms'den kısa etkileşim stresinde 27 ms'ye çıktı. Bu sıçramalar ve gerçek telefon akıcılığı kabul testinde izlenmelidir. Yoğunluk azaltma eşiği ve tek RAF yaşam döngüsü ayrıca test edildi.

## Yapay zekâ ve maliyet

Gerçek hesap anahtarıyla iki kimlik de `/v1/models` ve sohbet çağrılarında erişildi. Son tur: Lite 8/8, medyan 1530 ms, en yüksek 1901 ms; Flash 8/8, medyan 1404 ms, en yüksek 1772 ms. Flash varsayılan; Ayarlar'dan değiştirilebilir. 8 çağrının toplam tokenları Lite 1704 giriş / 272 çıkış; Flash 1704 / 286. Katalog tahminleri sırasıyla 0,0004596 USD ve 0,0004701 USD; katalog fiyat kaynağı doğrulanmış değil, gerçek tahsilat alanı dönmedi. Kesin maliyet avantajı iddia edilmez. İstekler yalnız genel Türkçe test cümleleriydi. Ayrıntı: [sunucu ve model raporu](SERVER_SETUP.md).

## Gerçek cihazda kısa kabul testi

1. iPhone 16 Pro Max'te Safari ve ana ekrana eklenmiş sürümde Bluetooth müzik aç. Sessizde uygulamayı aç, rota başlat, kilitle/geri dön: ses başlamamalı. Sonra iki sesli modu ayrı dene; anons sonrası müziğin düzeyini kontrol et.
2. Güvenli bir yolculukta şehir/çevre yolu/dur-kalk, kaçırılan dönüş ve paralel yol dene. Yolcu'ya bir yolcu gözlemci baksın. Tek GPS sıçraması rota üretmemeli; gerçek sapmada eski dönüş kaybolmalı. Tanılamadan fark etme, başlatma ve servis sürelerini ayrı kaydet.
3. Yol üstü açıkken takip, Ortala, 2D/3D ve durak sıralamasını kontrol et. Bir otopark seç, fiziksel olarak park et, not kaydet, yürüyüşe ve Arabaya dön'e geç. Bilinmeyen saat/doluluk garantisi görünmemeli.
4. En az 40 dakika **gerçek zamanlı** sürüşte kare süreleri ve konum yaşını ara ara kaydet; Safari'nin bellek/ısı/batarya davranışını izle. Bu ortamda fiziksel GPS, Bluetooth, ekran kilidi ve uzun cihaz oturumu yapılmadı.

Çok yakın paralel yollar ve yatay koordinatı aynı üst/alt yollar, GPS'in doğruluk sınırının altında kesin ayırt edilemez. Harita kat/yükseklik bilgisi her yerde yoktur. Trafik yönü olay çizgisinden çıkarılır; yönü olmayan nokta olayında kesin yön iddiası yapılmaz. Olayın toplam gecikmesi ETA'ya yeniden eklenmez; seçili güzergâhın trafikli süresi kullanılır. Canlı süre yoksa tahmin etiketi gösterilir. Nöbet listesinin kayıt başlangıcı ve açık saat notları değerlendirilir; servis genel bir kesin bitiş saati yayımlamadığından tam açık olma garantisi yerine telefon teyidi istenir.

[Valhalla eğim ve yol verisi](https://valhalla.github.io/valhalla/api/map-matching/api-reference/) · [TomTom işletme/saat yanıtları](https://docs.tomtom.com/search-api/documentation/search-service/points-of-interest-search) · [İzmir Belediyesi resmî servis dokümanı](https://openfiles.izmir.bel.tr/111324/docs/ibbapi-WebServisKullanimDokumani_1.0.pdf)
