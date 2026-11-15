# Navigasyon / servis geri kazanımı — devam noktası

Temel: origin/main `dfaddc1` (yeniden fetch ile doğrulandı); eski çalışan sürüm `dc9e562`. Düzeltme branch'i: `fix/navigation-service-recovery`. Yeni özellik geliştirmesi durduruldu. `feat/post-release-stop-comfort` korunuyor; bu branch'e taşınmadı. Main'e merge veya canlı yayın yapılmadı.

## Kanıtlanmış nedenler ve düzeltmeler

1. **GPS:** `js/location.js`, `js/nav.js`, `js/replan.js` iki main arasında aynıydı; GPS motorunun dfaddc1'de değiştirilmiş olduğu iddia edilemez. Yinelenen/reddedilen örnek, son iyi ölçüm hâlâ güncel olsa bile FixStream sağlık metnini bozabiliyordu. Kabul edilen ölçümün durumu ayrıldı. Sürüş doğruluk sınırları ve 5 saniyelik eskime sınırı gevşetilmedi. Tek watch + süre sınırlı one-shot, sessiz/stale watch toparlanması, foreground yeniden bağlanması ve eski callback koruması eklendi. İzin/timeout/unavailable ve GPS/yol eşleşmesi sorunları ayrı gösterilir. Yaklaşık konum yalnız keşif/haritada; navigasyon ilerlemesinde kullanılmaz.
2. **İşletmeler:** Eski Overpass zinciri gerçek ağda timeout/406/CORS hatası veriyordu ve istemcide kesin süre sınırı yoktu. Yüklü gerçek harita POI'leri kullanılabilir. Uzak ücretsiz arama tür/radius denetimli, kuyruklu Nominatim (istekler arasında 1,1 sn), Photon ve süre sınırlı Overpass ile çalışır. Her kategori isteği toplam 16 sn ile sınırlıdır; eski panelden gelen sonuç uygulanmaz. Gerçek doğrudan API ölçümü: 13 yakıt, 24 market, 26 eczane. Gerçek uygulama ekranında haritadan 3 yakıt, 6 market, 6 eczane; gerçek adlar ve kuş uçuşu mesafeler/pinler doğrulandı. Bunlar tüm işletmelerin kapsandığı veya yol mesafesi olduğu iddiası değildir.
3. **TomTom / Pages:** Tarayıcı anahtarı kaldırılmıştı ama hasServerAPI Pages'te daima false ve istekler yalnız aynı kaynak /api'yeydi. Pages sunucu çalıştırmadığı için trafik kaybolmuştu. Tarayıcıya anahtar geri konmadı: HTTPS uzak gateway bağlantısı, owner oturumu, yalnız doğru API hostuna Authorization header ve MapLibre tile bağlantısı eklendi. Oturum değişince eski trafik ve model sonuçları iptal/geçersiz olur.
4. **AI:** Gerçek sağlayıcı kataloğu ortak Web API transportuyla alınır; model tercihi gateway Durable Object'te kalıcıdır. AI_MODEL kilidi açıktır. Yerel workerd üzerinden gerçek sağlayıcıdan 27 model, model seçimi ve bir metin yorumlama isteği başarılı. Bağlantı yok/401/timeout senaryoları model uydurmaz; normal rota/ücretsiz arama devam eder. Provider anahtarı istemci, kişisel yedek ve bundle'a konmaz.
5. **Önizleme:** localhost kapısı Pages'te önizlemeyi devre dışı bırakıyordu. Açık `?preview=1` tüm hostlarda ayrı `yolcu.preview.v1` deposuyla çalışır; normal uygulama linki `./` ile Pages alt yolunu korur. Simülasyon duraklatılması gerçek GPS arızası diye gösterilmez. Normal modda simülasyon, var olan gerçek yolculuk devam kaydını silmez.
6. **ETA:** Tarihî 19 km / 3:44 kök nedeni hâlâ kanıtlanmadı. Yeni gerçek Valhalla kontrolü 18,89 km için 2110,591 sn (~35 dk) üretti; aynı sorun yeniden üretilemedi. Önceki zaman tabanı/durak gecikmesi korumaları korunuyor; bu görevde kanıtlanmayan bir ETA düzeltmesi tamamlandı denmez. [Önceki inceleme](../experience/ETA.md).

## Gerçek runtime'da yakalanan ek hatalar

- Native browser testi, yeni GeolocationSession timer'ına ham Window.setTimeout bağlandığında Illegal invocation yakaladı; arrow wrapper ile düzeltildi.
- Workers, fetch redirect:error seçeneğini desteklemiyor. Production ortak transport `manual` kullanır ve 3xx yanıtı reddeder; başka hosta anahtar yönlendirilmez. Node unit testleri bu gerçek runtime farkını tek başına yakalayamıyordu.
- Bu bulutun proxy gereksinimi doğrudan yerel workerd outbound bağlantısını engelliyor. Sadece test adapter'ı Node'un mevcut proxy/CA zincirini kullanır. Node'un açtığı sıkıştırmanın workerd'de tekrar açılmaması için content-encoding/length kaldırıldı. Production Worker adapter içermez; TLS/ağ politikası devre dışı bırakılmadı.

## Doğrulama ve kanıt sınırları

- `npm run check`: başarılı. `npm test`: 74/74 başarılı.
- Chromium ve WebKit native browser GPS/önizleme: ilk üçer test başarılı. Ölçümler browser Geolocation API'sinden gelir; `context.setGeolocation` sensör sağlayıcısını besler. Bu üç test `__yolcu.onPos` enjeksiyonu kullanmaz. Fiziksel iPhone değildir.
- Gerçek local workerd HTTP: health/session/services, TomTom yakıt15/market15, rota, binary trafik tile'ı (28.337 byte), sağlayıcı model kataloğu27, kalıcı model seçimi ve AI yanıtı başarılı. [HTTP kanıtı](evidence/gateway-live.json).
- Gerçek Chromium uygulaması: işletme/pin/mesafe, Valhalla rota alternatifleri, simülasyon ilerleme/duraklatma, uzak bağlantı ekranından gerçek local gateway oturumu, gerçek27 model ve token'ın localStorage'a yazılmaması doğrulandı. İşletme/rota/model yanıtları fixture değildi; yalnız same-origin services flag'i static Pages'i temsil edecek şekilde kapatıldı. [Kanıt](evidence/results.json).
- Önce/sonra ekranları: [dfaddc1 yakıt](screenshots/before-dfaddc1-fuel.png), [düzeltme yakıt](screenshots/after-fuel.png), [gerçek model listesi](screenshots/after-models.png), [duraklatılmış önizleme](screenshots/after-preview.png). İzmir açık test koordinatları kullanıldı; kullanıcı konum/geçmişi kullanılmadı. Önce ekranı immutable dfaddc1 statik kopyasından, sonra ekranı bu branch'ten alındı.
- Geniş Chromium/WebKit regresyon paketleri sürüyor. İlk Chromium turunda eski testin 5 sn pin bekleme sınırı, yeni 1,1 sn servis kuyruğuyla uyuşmadı; 16 sn toplam arama sınırına göre düzeltildi. Sonuçları nihai raporda ayrıca kaydet; başarısız ilk turu başarılı sayma. Aynı Playwright output klasörüne paralel yazan ilk iki tur trace dosyası çakıştırdı; ayrı output klasörleriyle yeniden çalıştırıldı.

## Hosting engeli

Kullanıcı henüz backend hesabı olmadığını bildirdi. Bu ortamın server-side provider sırları gerçek HTTP testinde kullanılabildi; fakat dağıtım hesabı/kimliği yok. **Public gateway dağıtılmadı. TomTom/AI'ın canlı Pages'te açıldığı iddia edilmez.** Deploy edilebilir Workers manifesti, SQLite migration, secrets, CORS, auth, kalıcı model seçimi ve komutlar hazır: [GATEWAY.md](GATEWAY.md). Build dry-run başarılı; provider değerleri bundle'da bulunmadı. Hesap açılınca secret'lar o hesaba ayrıca eklenmeli ve public URL + gerçek Safari/PWA yeniden doğrulanmalı.

## Devam / teslim

1. Çalışan regresyon turlarının sonuçlarını oku: `artifacts/recovery/chromium-final.txt`, `chromium-recovery.txt`, `webkit-critical.txt`. Hata çıkarsa ilgili kod/testi düzelt ve yalnız etkilenen senaryoları yeniden çalıştır.
2. WebKit uzak backend oturum/401 testini de çalıştır. Son check, unit ve Worker build kanıtını rapora kopyala.
3. Tüm değişiklikleri bu branch'te commit/push et. Main'e merge/yayın yapma. GitHub API bu ortamda izinli host değil; gerçek PR açılamazsa karşılaştırma bağlantısını ve hazır açıklamayı ver, PR açıldı deme.
4. Gerçek iPhone Safari/PWA konum izinleri, kilit/arka plan sonrası toparlanma, en az bir gerçek sürüşte rota/ETA/yeniden rota ve public gateway CORS/oturum doğrulamasını kullanıcı yapmalı. Bunlar tamamlanmış sayılmayacak.
