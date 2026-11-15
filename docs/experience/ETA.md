# ETA incelemesi ve sınırları

## Paylaşılan 19 km / 3:44 ekranı

Bu ekranın tam servis yanıtı, seçili route nesnesi, trafik örneği, aktif durak listesi ve kullanılan çalışma ağacı mevcut değil. **Tarihî kök neden kesinleştirilmedi.** Bir koruma eklenmiş olması ekranın sebebini kanıtlamaz.

`node tools/audit-timing.mjs`, depodaki 14 Kasım 2026 açık İzmir kayıtlarını gerçek Navigator üzerinden başlatır ve özet/manevra saatlerini karşılaştırır:

| Kayıt | Mesafe | Servis özeti | Manevra toplamı |
|---|---:|---:|---:|
| 1 | 30,79 km | 2167,019 sn | 2167,011 sn |
| 2 | 18,89 km | 2110,591 sn | 2110,584 sn |
| 3 | 17,43 km | 2549,890 sn | 2549,880 sn |

18,89 km kaydı yaklaşık **35,18 dakika** veriyor; 224 dakika üretmiyor. Kayıtlı TomTom örneğinin 30,84 km özeti 1764 sn, trafik gecikmesi 172 sn; gecikme seyahat süresinin içindedir.

## Kod geçmişinde bulunanlar

- `5dd36c5` (13 Kasım): önceki trafik yenilemesi kalan rotayı `time:1` ile gönderiyordu. Bu, oran paydasını hatalı yapabiliyordu. Bu hata **zaten eski commit’te değiştirilmiş**; bu görevde yeni düzeltilmiş gibi sayılmıyor. Paylaşılan ekranın bu kodu kullanıp kullanmadığı bilinmiyor.
- Güncel temel `dc9e562` içinde kalan yol için dönen `trafficTime`/`trafficLengthM` alanları `Object.assign(r,t)` ile bütün rota nesnesine yazılıyordu. Bu iki farklı uzunluğa ait saatleri aynı nesnede birleştiriyordu. Artık kalan trafik kendi zaman/uzunluk bağlamıyla saklanıyor; bütün rota özeti değiştirilmez.
- Önceki sürüm altı dakikadan eski trafik oranını ETA için kullanmaya devam edebiliyordu. Yeni süre ve karşılaştırma katmanı eski örneği kullanmaz; bütün alternatifler aynı zaman tabanına döner. Ekran etiketi de bu tabanla tutarlıdır.
- Manevra toplamı ile servis özeti ayrışırsa kalan oran servis özetiyle aynı saate oturtulur. Uyuşmazlık tanılamada görünür; bunun tarihî ekranda yaşandığı kanıtlanmış değildir.
- Favori kısayolunda anahtarsız rota süresini açıklamasız %15 azaltan `*0.85` kaldırıldı.

## Durakların etkisi

İşletmeler mevcut konum → mevcut duraklar → yeni durak → hedef yol ağıyla karşılaştırılır. Ortak trafik tabanı, mevcut beklemeler, aktif bekleme ve yeni duraklama ayrı tutulur. Ulaşma süresi ek sürüşün içindedir; ayrıca toplanmaz. Park senaryosunda yürüyüş hem toplam varışa hem tam yolculuk farkına dahildir; yalnız ek sürüş ayrı gösterilir. Yeni duraklama toplam süreye bir kez eklenir.

Havuz en fazla 12 aday, aynı anda 3 hesap; sonuçlar tam rota etkisinden sonra sayfalanır. Bu bütün şehirde küresel optimum garantisi değildir. Veri/servis başarısızlığında hesaplanamayan adaylara süre uydurulmaz.

## Test ve güvenlik sınırı

Birim testleri; uyuşmaz manevra toplamını, eski trafik örneğini, çift gecikme/duraklama sayımını, kalan trafik bağlamını ve otopark yürüyüşünü sınar. Doğrulanmış yüksek sağlayıcı süresi keyfî hız varsayımıyla kırpılmaz: gerçek bir büyük gecikme varsa saklanır.

`?diagnostics=1` opt-in geliştirici görünümünde sayısal süre bileşenleri incelenebilir; konum/geçmiş/anahtar/model isteği rapora yazılmaz. Sorun tekrarlandığında o oturumun sürümü, rota özeti, manevra toplamı, trafik örneği yaşı ve bekleme süreleri aynı anda incelenmelidir.

GPS kabulü, rota eşleme ve yeniden rota motorunun kodu korunmuştur. ETA davranışı değiştiği için **gerçek iPhone/Safari/PWA sürüş doğrulaması gereklidir**. Bu branch yayınlanmadı; fiziksel sürüş veya Bluetooth testi yapılmış gibi sunulamaz.
