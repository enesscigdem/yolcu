# Yolcu — bütün uygulama geliştirmesi

15 Kasım 2026 · Europe/Istanbul · geliştirme incelemesi

Temel `dc9e562`; branch `feat/yolcu-complete-experience`. İlk Yol üstü PR’ı korunarak uygulama kodu geliştirildi. İlk geliştirme aşamasında main’e birleştirme veya canlı yayın yapılmadı; kullanıcının sonraki yayın isteği ve güncel işlem durumu [RELEASE.md](RELEASE.md) içinde izlenir. Kalıcı devam noktası: [PROGRESS.md](PROGRESS.md).

## Ekranlar ve davranış

**Ana ekran:** ev/iş kartlarında yer adı ve kesilmeyen tahmin, doğrudan ihtiyaç keşfi, kişisel yerler, dolu olduğunda geçmiş/son aramalar. Boş geçmiş kartları ilk ekranı doldurmaz. Açık/koyu yüzeyler, tipografi, dokunma hedefleri ve ikonlar bütün ekranlarda ortak.

**Harita:** daha doğal açık su/zemin ve koyu yeşil-grafit palet; okunabilir yol etiketleri; kaynakta bulunan bina tabanları ve yükseklikler. Bilinmeyen yüksekliğe uygulama tarafından 4–6 metre eklenmez. 3B binalar ile DEM arazi/gölge ayrı kontrollerdir; ağır arazi varsayılan kapalıdır, kullanıcı açabilir. Varsayılan 3B bina görünümü korunur. Çizim sürekli yavaşsa önce binaların gerçek çizim katmanı, ardından ikincil etiketler azaltılır; yalnız yüksekliği sıfırlayıp aynı geometriyi çizmeye devam edilmez. Reduced-motion tercihi dikkate alınır.

**Arama ve geçişler:** arama → işletme → rota geri zinciri sorguyu, sonucu ve kaydırmayı korur. GPS veya etkin navigasyon geçmişten geri yüklenmez. Ayarlar; görünüm, ses/radar, rota, kişisel yolculuk, trafik bağlantısı ve veriler olarak ayrıldı. AI modeli ayrı ekrandır. Bir kişisel yeri düzenleyince çağıran ayar/yer ekranına dönülür. Bekleyen arama/model istekleri eski ekrana sonuç yazamaz.

**Yol üstü:** ileri rotada beş örnekleme noktasından aday alınır; en fazla 12 adayın tam rota etkisi, aynı anda en fazla üç aday hesabıyla karşılaştırılır. Sıralama sonrası sayfada altı yer gösterilir. Gerçek işletme işaretleri hesap tamamlanmadan da görünür; hesaplanmamış süre yerine durum yazılır. Kullanıcı o sırada yer seçebilir, haritada gösterebilir, kaydedebilir ve duraklama girebilir; süre gelince bağlamı korunur. Hesap kesinleşmeden Durak ekle etkinleşmez.

**Varış ve duraklar:** ulaşım süresi, ek sürüş, duraklama ve yeni tahmini varış ayrı ve kısa gösterilir. Bilgi ayrıntısı açılır bölümdedir. Park sonrası yürüyüş hem toplam varışa hem tam yolculuk farkına dahildir. Durak ekleme/atlama/kaldırma/sıralama gerçek rotayı günceller. Durak listesi konum geçici olarak yokken de okunabilir; düzenleme güncel konum ister. Aktif bekleme kullanıcı tarafından bitirilebilir. İptal edilen “yola devam et” işlemi eski durakları/beklemeyi başka hedefe taşımaz.

**Kişisel asistan:** ev/iş, kayıtlı yerler, yakıt/marka tercihleri, hatırlatmalar, kişisel ödeme işaretleri, araç girişi, park notu, geçmiş ve favori güzergâhlar korunur. Nadiren gereken düzenleme seçenekleri birincil karttan ayrılmıştır. Model yalnız niyeti çözümler; işletme/koordinat/saat üretmez ve kendiliğinden rota değiştirmez.

**AI ve trafik:** istemciye yazılan iki sabit model seçeneği kaldırıldı. Hesap kataloğu güvenli sunucudan gelir; arama, seçili model, kaydetme hatası, boş katalog ve sunucudan sabitlenmiş model durumları ayrıdır. Tercih dosyasında yalnız model kimliği bulunur. TomTom anahtarı, istek adresleri ve trafik karoları aynı kaynaklı Node vekilinde yönetilir; eski tarayıcı anahtar alanları/kayıtları kaldırılır. AI çalışmasa da cihazda çözümleme, arama ve navigasyon sürer. [Backend mimarisi ve dağıtım hazırlığı](BACKEND.md).

## Önce / sonra

Görseller gerçek uygulamadan, **440×956 CSS px** boyutta ve Europe/Istanbul saat diliminde alındı. “Önce”, `dc9e562` arşivini çalıştıran ayrı sunucudur. Uygulama ekranları, kayıtlı açık İzmir işletme/rota örnekleri ve gerçek haritayı kullanır. Sonra model ekranında gerçek hesap kataloğu vardır; önce ekranı main’deki sabit seçimi gösterir. Gerçek iPhone fotoğrafı, fiziksel GPS sürüşü veya tüm sonuçların canlı doğrulaması değildir.

| Akış | Önce | Sonra |
|---|---|---|
| Ana ekran | [Önce](images/before/home.png) | [Sonra](images/after/home.png) |
| 3B görünüm | [Önce](images/before/home-3d.png) | [Sonra](images/after/home-3d.png) |
| Koyu tema | [Önce](images/before/home-dark.png) | [Sonra](images/after/home-dark.png) |
| Arama | [Önce](images/before/search.png) | [Sonra](images/after/search.png) |
| Rota seçenekleri | [Önce](images/before/routes.png) | [Sonra](images/after/routes.png) |
| Sürüş | [Önce](images/before/navigation.png) | [Sonra](images/after/navigation.png) |
| İhtiyaç menüsü | [Önce](images/before/roadside.png) | [Sonra](images/after/roadside.png) |
| İşletme sonuçları | [Önce](images/before/results.png) | [Sonra](images/after/results.png) |
| İşletme / yeni varış | [Önce](images/before/place.png) | [Sonra](images/after/place.png) |
| Benim yerlerim | [Önce](images/before/personal-places.png) | [Sonra](images/after/personal-places.png) |
| Ayarlar | [Önce](images/before/settings.png) | [Sonra](images/after/settings.png) |
| Model seçimi | [Önce](images/before/models.png) | [Sonra](images/after/models.png) |
| Koyu ayarlar | [Önce](images/before/settings-dark.png) | [Sonra](images/after/settings-dark.png) |

## ETA incelemesinin sonucu

Kayıtlı 18,89 km örnek hem servis özetinde hem Navigator’da yaklaşık 35,18 dakika veriyor. Aynı açık noktalarla canlı Valhalla kontrolü de 2110,591 sn verdi. Tarihî 3:44 oturumunun süre bileşenleri mevcut değil; **kesin kök neden tamamlandı denmiyor**.

Bu görevde eski trafik örneklerinin kullanılmaması, kalan trafik ile bütün rota saatinin ayrılması, manevra/özet uyumsuzluğunun sınırlandırılması, çift bekleme/gecikme sayımı ve park yürüyüşü üzerinde kod/test çalışması yapıldı. Geçerli bir yüksek sağlayıcı tahmini keyfî bir hıza göre kırpılmıyor. Ayrıntı ve kod geçmişi: [ETA.md](ETA.md).

## Gerçek servisler ve testler

- İlk gerçek YapayZekaLab kontrolü 25 model döndürdü; 15 Kasım devam kontrolünde güncel katalog **27 model** döndürdü. `gemini-3-flash` seçildi; açık motorin/kahve cümlesi `fuel` ve `cafe` olarak çözüldü. Tek istekte yaklaşık 1,9 sn; bütün modellerin performans ölçümü değildir.
- Yeniden başlatılmış backend’de yapılandırma, model durumu, katalog ve TomTom Konak araması HTTP 200; arama bir sonuç döndürdü. Anahtar veya özel hesap verisi rapora yazılmadı. [Güvenli servis kanıtı](evidence/backend.json).
- Son uygulama kodu `91114cf`: kod/HTML/SW kontrolü başarılı, **59/59 birim testi** geçti.
- Tam Chromium `d1fe98f`: **32/32** (445,6 sn). Son harita/bina dönüşü düzeltmeleri ilgili testlerle; son klavye/giriş/çevrimdışı akışları `91114cf` üzerinde **6/6** (45,8 sn) doğrulandı.
- Son tam WebKit `91114cf`: **33/33** (278,1 sn), başarısız/atlanan/flaky yok. Tam Chromium turu ile son uygulama hash’i aynıymış gibi sunulmuyor.
- Önceki `a5c00f4` WebKit turundaki klavye hatası (32/33) ve marker erişilebilir ad hatası kayıtlıdır; `91114cf` sonrası ilgili davranışlar son tam WebKit’te geçti. [Kaynaklarıyla test sonuçları](VALIDATION.json).
- İlk geniş turlardaki iki Chromium ve bir WebKit başarısızlığı gizlenmedi. Önizlemede servis bekleme sınırı, çizim uyarlamasının geç devreye girmesi ve görüntü çözümleme/ara katman davranışı incelendi. Hata beklentileri veya performans örnek eşiği kaldırılmadı.

Safari/PWA kapsamı ve gerçek cihazda kalanlar: [SAFARI-PWA.md](SAFARI-PWA.md). Klavye alanı artık düzenleme panellerini görünür alana taşır; odaklanan alan panelin içinde kaydırılır, pinch yakınlaştırması klavye sayılmaz. İlk çevrimdışı yeniden açılışta kurulum önbelleğindeki MapLibre de kullanılır. Süre hesabının bitmesi devam eden liste/harita dokunuşunun hedefini silmez. Harita işaretleri ekran okuyucuya işletme adını verir; sürüş bitince ana ekran bina ayrıntısı geri açılır.

## Harita verisinin sınırı ve seçenekler

OSM/OpenFreeMap’te verilen bina yüksekliği kaynakça türetilmiş olabilir; ölçülmüş yükseklik veya gerçek cephe dokusu garantisi yoktur. Uygulama eksik detayı uydurmaz. Aynı durum adres, işletme saati, yakıt stoğu ve otopark doluluğu için geçerlidir.

| Seçenek | Kazanç | Karar gerektiren konu |
|---|---|---|
| Mevcut OpenFreeMap/OSM | Açık veri, gerçek taban geometrisi, özelleşen sakin stil | Bölgesel adres/yükseklik/POI kapsamı değişir |
| Yönetilen vektör sağlayıcısı (MapTiler/Mapbox vb.) | Etiket/POI araçları, operasyon ve stil seçenekleri | İzmir özelinde veri karşılaştırması, lisans/ücret ve erişim yönetimi |
| Yetkili belediye yükseklik/3B verisi | Belirli bölgede daha gerçek ölçüm ayrıntısı | Veri erişimi, lisans, dönüştürme ve renderer maliyeti |
| Mevcut Esri uydu görünümü | Gerçek görüntü bağlamı | Canlılık ve bina yüksekliği kanıtı değildir |

Bu sağlayıcılar kurulmuş veya veri kapsamları eşitmiş gibi gösterilmedi. Yeni 3B bina/doku verisi satın alınmadı, üretilmedi veya gerçek dışı biçimde eklenmedi.

## Yayına kabul için açık kalanlar

Fiziksel iPhone 16 Pro Max ve küçük iPhone’da Safari/PWA, safe-area/klavye, GPS kaybı/dönüşü, yeniden rota, ETA, Bluetooth ses ve uzun oturum doğrulaması hâlâ gerekir. Headless Linux WebKit bu onayın yerine geçmez. Yazılımsal çizim ortamında kare aralıkları gerçek iPhone akıcılığı veya GPU’nun sunduğu kare ölçümü sayılmaz.

HTTPS backend’in sürekli işletimi ve alan adı/DNS/kimlik doğrulaması hazırlanmalı; bu dal tarafından dağıtım yapılmadı. Tarihî ETA girdileri hâlâ eksiktir. Gerçek PR açılamazsa ağdaki `api.github.com` engeli ve hazır PR metni ayrıca bildirilecektir. Bu sınırlara rağmen “her şey tamamlandı / canlıya hazır” denmeyecek.

## GitHub teslimi

Tüm uygulama commit’leri `feat/yolcu-complete-experience` branch’ine pushlandı. [Branch](https://github.com/enesscigdem/yolcu/tree/feat/yolcu-complete-experience) · [hazır PR metni](PR.md). Gerçek taslak PR oluşturma isteği `Post "https://api.github.com/graphql": Forbidden` ile reddedildi; ortamın kısıtlı ağ listesinde `api.github.com` yok. **PR açılmadı**. [Oluşturma bağlantısı](https://github.com/enesscigdem/yolcu/pull/new/feat/yolcu-complete-experience) bir PR inceleme URL’si değildir. Main’e birleştirme ve yayın yapılmadı.

Görsel örnekler `91114cf` ekranlarını gösterir. Son küçük yüzey düzeltmesi `5677406` ile arkadaki yinelenen ana ekran yüzeyi gizlendi; ilgili akışlar iki tarayıcıda 3/3 geçti. Yayın isteğinden sonraki durum [RELEASE.md](RELEASE.md) içinde izlenir.
