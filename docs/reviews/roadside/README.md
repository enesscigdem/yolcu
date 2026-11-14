# Yol üstü — ilk geliştirme dilimi

İnceleme tarihi: 15 Kasım 2026. Temel: `6509eaf` (GitHub main ile aynı HEAD doğrulandı).

## Gerçek kod değişiklikleri

- Rota yokken mevcut konuma yakın işletmeler aranır; kuş uçuşu mesafe açıkça etiketlenir. Yol süresi uydurulmaz. Yol tarifi mevcut rota oluşturma akışını açar.
- Rota varken mevcut yol ağı üzerinden hesaplanan durak seçenekleri ve sıralama motoru korunur. Liste ve haritadaki numaralar eşleşir; işletme seçimi ayrıntı kartını açar. Haritada göster açık bir eylemdir; aktif sürüşte arama kendiliğinden kamerayı başka yere götürmez.
- Geri düğmesi önceki panele, listeye ve kaydırma konumuna döner. Sonuçtan geri dönünce arama tekrarlanmaz. Form alanları korunur. Kapatma ve rota geçersizleştirme işaretleri temizler; bekleyen işlemler iptal edilir.
- Ulaşım ve toplam yolculuğa ek sürüş ayrı etiketlenir. Ulaşımın ek sürüşe dahil olduğu belirtilir; duraklama ayrı kalır. Bir dakikadan küçük pozitif/negatif farklar `1 dk’dan az fark` olarak gösterilir.
- Detay kartındaki Durak ekle sabittir. Mevcut durak ekleme, atlama/kaldırma, sıralama ve park sonrası yürüyüş akışları korunur.
- Komut formu isteğe bağlı açılır bölüme taşındı. Daha kısa panel, 44 px dokunma hedefleri ve kesilmeyen ev/iş süreleri eklendi. Üst manevra kartı görünür kalır.

## Görsel kanıt

Gerçek uygulama, Chromium, 440 × 956 CSS piksel (iPhone 16 Pro Max boyutu). İzmir’de daha önce kaydedilmiş açık servis verileri test fixture’larıyla tekrar oynatıldı. Harita gerçek OpenFreeMap verisidir. İşletmeler ve rotalar bu oturumda canlı servisten doğrulanmış sayılmaz. Gerçek iPhone/Safari/PWA veya fiziksel sürüş testi değildir. Önce görüntüleri ana branch kodundan ayrı geçici dosyalarda çalışan sunucudan alındı.

| Akış | Önce | Sonra |
|---|---|---|
| Ana ekran / iş süresi | [Önce](before-home.png) | [Sonra](after-home.png) |
| Yol üstü menüsü | [Önce](before-roadside.png) | [Sonra](after-roadside.png) |
| İşletme sonuçları | [Önce](before-results.png) | [Sonra](after-results.png) |
| Seçim ve haritada konum | Önce ayrı detay kartı yoktu | [Sonra](after-detail.png) |

## Doğrulama

- `npm run check`: geçti.
- `npm test`: 48 geçti, 0 başarısız, 0 atlandı.
- Chromium: 9 farklı Yol üstü senaryosu doğrulandı. İlk son turda 7 geçti; nöbet kaydının gün sınırı nedeniyle 1 test, eşzamanlı WebKit denemesinin ortak çıktı klasörünü silmesi nedeniyle 1 test başarısız oldu. Nöbet fixture tarihi Türkiye’de 08.00 gün devrine göre düzeltildi; son iki test tek başına tekrar çalıştırıldı ve 2/2 geçti (47,6 sn). Üretim nöbet kuralları veya test beklentileri gevşetilmedi. Yeni kontroller: rotasız arama, numaralı işaretler, detaydan listeye/menüye geri dönüş, form süresinin korunması ve negatif sıfır gösterimi.
- Etkileşim turu desteklenen 2D harita modunda çalıştı; ilk geniş Chromium denemesindeki 3B/screenshot zaman aşımları nedeniyle varsayılan 3B performansı doğrulanmış sayılmıyor. Tüm uygulama tarayıcı paketi için tam geçiş iddiası yok.
- WebKit indirilmiş olsa da GTK4, Graphene, HarfBuzz ICU, Manette, Hyphen ve GLES sistem kütüphaneleri eksik. Desteklenen bağımlılık yükleyicisi yönetici erişimi alamadı; WebKit çalıştırılamadı. Başarılı Safari testi iddia edilmiyor.

Doğrulama komutları: `npm run check`, `npm test`, `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npm run test:e2e -- --project=chromium tests/roadside.spec.js --timeout=90000`; düzeltme sonrası `--grep "official duty|map selection"` hedefli turu.

## Bulgular ve sonraki iş

**ETA:** kayıtlı 18,89 km örneğin servis özeti 35,1765 dk; manevra sürelerinin toplamı 35,1764 dk. Rapordaki 3:44 bu fixture ile doğrulanmadı. Bu PR navigasyon süresi, trafik oranı, GPS kabulü, yeniden rota veya kamera takip motorunu değiştirmez. Yüksek ETA’nın kesin nedeni hâlâ açıktır; sorunlu oturumda trafik oranı, seçili rota, bekleme süreleri ve manevra toplamı birlikte kaydedilerek yeniden üretilecek. Gerçek iPhone doğrulaması olmadan canlıya çıkarılmamalı.

**Sıralama sınırı:** mevcut motor önce rota yakınlığıyla üç adayı seçer, sonra tam rota farkını hesaplayıp bunları sıralar. Listede gösterilenlerin sırası gerçek hesaplanan ek sürüşe göredir; tüm şehirde küresel en iyi üç işletme garantisi değildir. Daha geniş aday havuzu ve yolun karşı yönünü de değerlendiren sıralama sonraki dilimdir. Yeni varış saatiyle bütünleşik karşılaştırma da henüz eklenmedi.

**Gizli bilgiler ve mimari:** bu örnekte `AI_API_KEY` ve `TOMTOM_API_KEY` değişkenleri mevcut. Değerleri okunup raporlanmadı veya tarayıcıya taşınmadı. `AI_BASE_URL` ve `AI_MODEL` yok; `/api/ai/status` `configured:false` döndü. TomTom için yalnızca okuma amaçlı sunucu kontrolü ağ/vekil katmanında başarısız oldu; anahtarın kullanılabilirliği kanıtlanmadı. GitHub Pages sunucu API’sini çalıştırmaz. Mevcut TomTom tarayıcı entegrasyonu cihazda girilen anahtarı kullanıyor; tüm trafik/işletme isteklerinin sunucu vekiline taşınması ayrı bir güvenlik işi olarak canlı yayın öncesi tamamlanmalı. Bu PR gizli anahtarı istemciye enjekte etmez.

Model seçimi ekranı ve sunucu model kataloğu, AI kesintisinde bağımsız navigasyon, harita veri kalitesi ve doğal 3B görünüm sonraki iş paketleridir. OSM’de olmayan adres/yükseklik/işletme bilgisi üretilmedi.

## Yayın durumu

Main’e birleştirme, GitHub Pages yayını veya ortam yayını yapılmadı. GitHub REST API erişimi bu ortamda 403 ile reddediliyor; PR oluşturulması ancak erişim çalıştığında doğrulanabilir.
