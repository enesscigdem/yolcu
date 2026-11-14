Yol üstü araması artık navigasyon yokken mevcut konuma yakın işletmeleri bulur; navigasyonda mevcut tam rota farkı hesaplamasını kullanır. Numaralı harita işaretleri listeyle eşleşir ve seçilen işletme için ayrı detay kartı açılır. Ulaşım ile yolculuğa ek sürüşün ilişkisi açıklanır; duraklama ayrı kalır.

Geri düğmesi önceki listeyi, kaydırmayı ve form durumunu geri getirir. Komut formu isteğe bağlı açılır, detay kartındaki Durak ekle eylemi sabitlenir, ev/iş süreleri kesilmez ve küçük negatif süre farkları “−0 dk” göstermez. Mevcut durak ekleme/sıralama/kaldırma motoru korunur.

Önce/sonra görüntüler ve Türkçe inceleme raporu: [İnceleme raporu](README.md). Görüntüler gerçek uygulamadan ve kayıtlı açık İzmir servis örneklerinden alındı; canlı işletme veya gerçek cihaz doğrulaması değildir.

Doğrulama: kod kontrolü ve 48 birim testi geçti. Dokuz farklı Chromium Yol üstü senaryosu hedefli turlarda doğrulandı (7 geçen + düzeltme sonrası 2 geçen); ayrıntılı sonuç ve sınırlar inceleme raporunda. WebKit sistem kütüphaneleri eksik olduğundan çalıştırılamadı. GPS, ETA hesaplama ve yeniden rota motoru değiştirilmedi; 19 km / 3:44 sorununun nedeni henüz kesinleştirilmedi. Main’e birleştirmeyin veya canlıya yayımlamayın; gerçek iPhone/Safari/PWA ve sürüş doğrulaması ayrıca gereklidir.
