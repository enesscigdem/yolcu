# Yolcu: bütünleşik ekranlar, yolculuk etkisi ve güvenli servis bağlantıları

Taslak PR hedefi: `main` ← `feat/yolcu-complete-experience`.

Ana ekran, arama → işletme → rota geçişleri, ayarlar ve kişisel yerler aynı tasarım ve geri dönüş davranışıyla çalışır. Main'deki ilk Yol üstü geliştirmesini korur; beş rota örnekleme noktasından en fazla 12 adayı toplam yolculuk etkisiyle karşılaştırır. Kullanıcı hesap sırasında işletmeyi seçebilir; yeni varış ve duraklama görünür, durak listesi gerçek rota ile güncellenir.

AI kataloğu hesapta kullanılabilir modelleri sunucudan getirir; arama, seçim, sunucu kilidi ve hata durumları ayrı gösterilir. TomTom anahtarı aynı kaynaklı sunucu vekilinde kalır. ETA katmanı eski trafik, kalan rota, manevra özeti ve bekleme/yürüyüş bileşenlerini tutarlı kullanır.

Safari klavye alanı düzenleme panellerine uygulanır; yakınlaştırma klavye sayılmaz. İlk çevrimdışı PWA açılışı kurulumdaki MapLibre önbelleğini kullanır. Süre hesabının bitmesi liste veya harita işaretine devam eden dokunuşu kaybetmez. Sürüş bitince ana ekran bina ayrıntısı geri açılır; işaretlerin erişilebilir adı işletme adıdır.

## İnceleme ve doğrulama

- [Türkçe rapor ve 13 akışın önce/sonra görüntüleri](REVIEW.md).
- [Makinece okunabilir test kaydı](VALIDATION.json), [Safari/PWA kapsamı](SAFARI-PWA.md).
- [ETA kanıtı ve belirsizlikler](ETA.md), [güvenli backend mimarisi](BACKEND.md).
- `npm run check` başarılı, 59/59 birim testi geçti.
- Chromium tam tur `d1fe98f`: 32/32. Son harita değişikliklerinde `864f168`: liste dokunuşu ve kaynak/ana ekrana dönüş geçti; erişilebilir ad sorunu `a5c00f4` sonrası harita dokunuşu testiyle geçti.
- Son kod `91114cf`: odaklı Chromium 6/6; **tam WebKit 33/33**. Başarısız önceki turlar ve kod hash’leri `VALIDATION.json` içinde korunur.
- Yeniden başlatılmış gerçek backend: 27 model, model durumu ve TomTom araması HTTP 200. Sırlar rapora veya istemci koduna yazılmadı.

## Yayın sınırı

Tarihî 19 km / 3:44 ekranının kesin kök nedeni kanıtlanmadı; aynı kayıt ve canlı açık rota yaklaşık 35,18 dk verdi. Linux WebKit fiziksel iPhone Safari/PWA, Bluetooth, gerçek GPS/yeniden rota/ETA ve uzun sürüş onayı değildir. HTTPS backend dağıtımı yapılmadı. Bu taslak main'e birleştirme veya canlı yayın isteği değildir.

## PR oluşturma durumu

Branch GitHub'a gönderildi. `gh pr create --draft` gerçekten denendi; `Post "https://api.github.com/graphql": Forbidden` yanıtı alındı. Mevcut ortam politikası `restricted` ve `api.github.com` izinli değil. Gerçek bir PR henüz açılmadı; bu dosya hazır PR açıklamasıdır.

[GitHub'da bu branch için PR oluşturma ekranı](https://github.com/enesscigdem/yolcu/pull/new/feat/yolcu-complete-experience). Bu bağlantı açık bir PR değildir. API erişimi sağlandığında mevcut PR olup olmadığı kontrol edilerek aynı branch kullanılmalıdır; kod yeniden yazılmamalı.
