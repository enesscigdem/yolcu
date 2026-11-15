# Yayın kaynağından sonra devam geliştirmesi

Main: `dfaddc1`, sürüm **2026.11.15.1**. Git main birleştirme ve push başarılı; Pages build/HTTP doğrulaması ağ engelinden dolayı tamamlanamadı. [Yayın günlüğü](RELEASE.md). Önceki bütün ekran geliştirmesi ve 13 akışın karşılaştırması: [REVIEW.md](REVIEW.md). Bu sayfa “Pages doğrulandı” anlamına gelmez.

Devam branch’i: **`feat/post-release-stop-comfort`**. Uygulama commit’i **`bf97bb2`**, geliştirme sürümü `2026.11.15.2-dev`. Bu geliştirme main’e birleştirilmedi.

## Kullanıcıya görünen yeni davranış

- İşletme kartında **Mola yok / 5 / 10 / 15 dk** seçenekleri tek dokunuşla duraklamayı seçer. Özel süre ve +/- kontrolleri korunur; seçili hızlı seçenek el ile girilen süreyle tutarlıdır.
- Yeni varış ve toplam yolculuk mevcut süre katmanıyla anında güncellenir. Süre/favori kontrolleri ek rota isteği başlatmaz ve “Durak ekle” seçilmeden rotayı değiştirmez.
- Kayıt yıldızı aynı karttan favoriye ekler ve tekrar dokununca çıkarır. Doluluk/erişilebilir ad kayıt durumuyla eşleşir; geri dönüp aynı işletmeyi açınca seçim ve süre korunur.
- En küçük 320 px senaryosunda hızlı seçimler yatay taşmaz; dokunma alanı en az 44 px’dir.

## Doğrulama

`npm run check` başarılı; 59/59 birim testi geçti. Yeni senaryo Chromium’da **1/1** (19,1 sn), WebKit’te **1/1** (12,4 sn) geçti. Test; hızlı/özel süreyi, favori ekle/çıkarı, harita işaretinin seçili kalmasını, kontrol değişirken rotanın değişmemesini ve açıkça eklendiğinde durak listesine gerçek 10 dk bekleme yazılmasını doğrular.

Önceki tam tarayıcı turları yeni özellik için tekrar tam tur gibi sayılmaz. [Bu aşamanın kanıtı](POST_RELEASE_VALIDATION.json). GPS kabulü ve rota/ETA hesap motoru değiştirilmedi; fiziksel iPhone testi yapılmadı.

## Görseller

“Yayın kaynağı”, `dfaddc1` değişmez arşivini çalıştıran localhost sunucusudur; canlı Pages ekranı değildir. Geliştirme ekranında 10 dk duraklama seçilidir. İki sürüm aynı açık İzmir rota/işletme kayıtlarını kullanır.

| Ekran | Yayın kaynağı | Devam geliştirmesi |
|---|---|---|
| İşletme / hızlı duraklama | [Önce](images/release/place.png) | [Sonra](images/post-release/place.png) |
| Benim yerlerim / tek yüzey | [Yayın kaynağı](images/release/personal-places.png) | [Geliştirme](images/post-release/personal-places.png) |

## Sonraki devam noktası

Önce `api.github.com` ve `enesscigdem.github.io` erişimi açılınca Pages kaynağını, build sonucunu ve canlı `js/assistant.js` sürümünü doğrula. Main’in sürümü 2026.11.15.1, bu branch’in sürümü 2026.11.15.2-dev olmalıdır. Mevcut uygulama geliştirmesini tekrar yazma; güncel commit ve test kanıtını oku. Sonraki değişiklikler bu branch’ten devam eder ve her mantıklı aşamada commit/push edilir.
