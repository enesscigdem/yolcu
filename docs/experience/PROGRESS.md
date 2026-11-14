# Yolcu bütün uygulama geliştirmesi — kalıcı ilerleme

Temel: `dc9e562a14b33cfc198d64f397267cef8e956617` (GitHub main doğrulandı). Branch: `feat/yolcu-complete-experience`. İlk Yol üstü geliştirmesi korunuyor. Main birleştirmesi/yayın yok.

| Kapsam | Durum | Doğrulama / kalan |
|---|---|---|
| Premium ana ekran, harita ve 3B | Kodlandı; görsel değerlendirme sürüyor | Ortak tasarım yüzeyleri, doğal palet, gerçek yükseklik; bilinmeyen bina yüksekliği uydurulmuyor |
| Geniş işletme havuzu, gerçek sapma, yeni varış | Kodlandı ve test edildi | 12 adaya kadar tam rota farkı, 3 eşzamanlı hesap, 6 sonuç/sayfa; toplam varış/duraklama |
| Arama, yerler, ayarlar ve geri bağlamı | Kodlandı; yeni ekran testleri sırada | Sunum geçmişi; GPS/navigasyon durumu geri alınmıyor |
| Navigasyon ve GPS güvenilirliği | GPS/Replanner korundu; görünüm güncellendi | 9 Yol üstü regresyon testi geçti; gerçek iPhone onayı yok |
| ETA incelemesi | Süre bütünlüğü katmanı kodlandı/test edildi; tarihî kök neden açık | Eski 3:44 oturum verisi yok. Eski trafik süresi ve manevra/özet uyumsuzluğu korunmaları eklendi |
| Sunucu model kataloğu ve güvenli trafik | Kodlandı; gerçek servis kontrolleri geçti | 25 model, gemini-3-flash seçimi, açık test cümlesi, TomTom araması HTTP 200. Pages backend dağıtımı yapılmadı |
| iPhone, erişilebilirlik, koyu tema | Kodlandı; tarayıcı doğrulaması sürüyor | 320–440 CSS px; reduced-motion, zoom erişilebilirliği, koyu tema; fiziksel cihaz yok |
| Kişisel yolculuk asistanı | Kodlandı | İhtiyaç keşfi, kayıtlı tercihler, tam rota maliyeti, modelden bağımsız cihazda çözümleme korundu |

## Çalışma kaydı

- Güncel main alındı, temiz çalışma ağacından yeni branch açıldı.
- Önceki PDF ve ekran görüntüleri önceki sohbet ve depodaki inceleme raporuyla birlikte esas alındı. Belgelerdeki tamamlanmış/yerel/doğrulanmamış ayrımları korunuyor.
- Bu dosya her mantıksal commit sonrasında güncellenecek. Test başarısızlıkları ve dış erişim engelleri de kaydedilecek.

## İlk uygulama diliminin kanıtı

- `npm run check`: geçti. `npm test`: 55/55 geçti.
- `tests/roadside.spec.js --project=chromium --timeout=90000`: 9/9 geçti, 4,1 dakika.
- Model kataloğu gerçek hesapta 25 model döndürdü. Önceki rapordaki gemini-3-flash seçildi; tercih dosyasına yalnız model kimliği yazıldı. Açık test cümlesi motorin + kahve için fuel/cafe verdi, yaklaşık 1,9 sn. TomTom sunucu vekilinde Konak araması HTTP 200 / 1 sonuç. Gizli değerler istemciye/repoya/rapora aktarılmadı.
- Daha geniş ekran akışlarını sınayan yeni `tests/experience.spec.js` sonraki doğrulama adımıdır.
- Tarihî 19 km / 3:44 ekranının tam girişleri mevcut değil. Üretilmiş uyumsuz manevra senaryosunun düzelmesi tarihî kök neden kanıtı değildir.
