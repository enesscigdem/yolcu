# Safari / PWA doğrulaması

Bu belge masaüstü otomasyonu ile gerçek iPhone kabulünü ayırır. Kod sürümü: `91114cf`; temel main `dc9e562`.

## Otomatik kontrol kapsamı

- 320×568, 390×844, 430×932 ve 440×956 CSS piksel boyutlarında ana ekran, rota ve Yol üstü panelleri; açık/koyu tema; kesilmeyen favori süreleri ve yatay taşma.
- Linux Playwright WebKit motorunda ekran geçişleri, gerçek rota kayıtlarından durak ekleme/sıralama/atlama, GPS replay, sesin sessiz kalması, kaynak temizliği ve eski model yanıtının ekranı bozmaması.
- `viewport-fit=cover`, yakınlaştırmayı engellemeyen viewport, standalone manifest ve safe-area CSS desteği.
- Görsel viewport 320 px klavye alanı ve 59/34 px safe-area ile simüle edildi: park alanı/düğmeleri kaydırılabilir, alt panel klavye üstünde, ayarlar görünür alanda kalır. Yakınlaştırma klavye olarak yorumlanmaz. Bu, iOS klavyesini gerçekten açmak değildir.
- SW açık ayrı localhost oturumunda kurulum tamamlandıktan **ilk çevrimdışı yeniden açılış**: uygulama yüzeyi, MapLibre kütüphanesi ve ayarlara erişim. API yanıtları cache'e yazılmaz. Yeni sürüm sürüş sırasında zorla etkinleştirilmez.
- Harita/rota/ağ verisi çevrimdışı hazırmış gibi sunulmaz. Rota hesaplamak ağ ister; çevrimdışı kabuk açılışı tam çevrimdışı navigasyon değildir.
- WebKit odaklanan alanı kendiliğinden kaydırmadığı için uygulama alanı kendi panelinin görünür bölümüne taşır; dış sayfayı kaydırmaz. Klavye/layout güncellemesi asenkron olduğundan test erişilebilir son geometriyi bekler.
- Süre hesabı pointerdown ve pointerup arasında tamamlandığında işletme butonu silinmez; dokunuş aynı işletmenin kartını açar; hem liste hem harita işareti yolu sınanır. Sürüş bitince ana ekran bina ayrıntısı yeniden açılır.

Nihai sayılar ve komutlar [VALIDATION.json](VALIDATION.json) ve [PROGRESS.md](PROGRESS.md) içinde bulunur. Başarısız turlar nihai geçiş olarak sayılmaz.

## Gerçek cihazda açık kalan kabul

iPhone 16 Pro Max ve küçük iPhone ile Safari + ana ekrana eklenmiş PWA'da durum çubuğu/güvenli alanlar, klavyenin açılıp kapanması, yakınlaştırma, yatay/dikey dönüş, kilit ve arka plan dönüşü ayrıca denenmelidir. Linux WebKit, Safari uygulaması veya iOS PWA işletim sistemi kabuğu değildir.

Gerçek GPS, paralel yol/üst geçit, sinyal kaybı ve dönüşü, yeniden rota, ETA/durak beklemesi, Bluetooth müzik, ses ve en az 40 dakikalık oturum bu ortamda doğrulanmadı. Yazılımsal GPU ölçümü gerçek cihaz akıcılığı kanıtı değildir. Bu doğrulamalar ve kullanıcının yayın kararı olmadan canlıya geçiş yapılmamalı.
