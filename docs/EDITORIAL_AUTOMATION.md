# GOLHAT — birleşme sonrası otomasyon sistemi

Bu depo GitHub Actions üzerinde haber araştırması, doğrulama, ortak haber havuzu ve futbol verisi üretir. Okur yayını SonSinyal ile birleşik Sites uygulamasındadır.

## Yayın hedefleri

- https://golhat.com ana spor gazetesi ve ortak haber ayrıntılarıdır.
- https://www.sonsinyal.com ortak yayın ağının ana gazetesidir.
- https://futbolhatti.golhat.com eski futbol ana sayfasını koruyan Futbol Hattı bölümüdür. Bu depodaki index.html, Futbol Hattı kaynağıdır; yeni ana sayfa tasarımı değildir.
- data/editorial/state.json doğrulanmış ortak haber havuzudur; yeni site bunu D1 arşiviyle birleştirir. data/*.json skor, lig ve kulüp kaynaklarıdır.
- Eski golhat.sonsinyal.com adresine POST gönderilmez. Yayın aktarımı doğrudan https://golhat.com/api/golhat/sync adresinedir.
- Bu ajanlar yeni Sites uygulamasının kodunu veya alan adlarını dağıtmaz; eski HTML kaynak ve arşiv katmanı olarak korunur.

## Çalışan görevlerin tamamı

| Görev | Sıklık | Sorumluluk |
| --- | --- | --- |
| Kategori Editörleri | Her saat 05 ve 35 | Fenerbahçe, Galatasaray, Beşiktaş, Trabzonspor, Anadolu, Süper Lig, Avrupa, Şampiyonlar Ligi, UEFA, transfer, yorum: 11 masa |
| Araştırma Kurulu | Dört saatte bir 40. dakika | Ayrı 12. editör rolü; dört uzman denetimiyle belge/veri araştırması |
| Baş Editör | 15 dakikada bir | Doğrulanmış havuzdan önem/güncellik sırası; Futbol Hattı ve ortak havuz manşeti |
| Ana Sayfa Bütünlük | 15 dakikada bir | Manşet, gövde, kaynak ve arşiv bağları |
| Canlı Skor | UTC 09–21 saatlerinde 10 dakika; diğer saatlerde 30 dakika; UTC 03 günlük program | API-Football/FotMob maç verisi |
| Süper Lig | UTC 09–23 saatlerinde 5 dakika; diğer saatlerde 30 dakika | TFF puan/fikstür |
| Kulüp ve KAP | İki saatte bir 25. dakika | Dört büyüklerin resmî açıklama, kadro, KAP ve fikstürü |
| Avrupa Ligleri | Dört saatte bir 15. dakika | Altı Avrupa ligi |
| UEFA | UTC 04, 10, 16, 22 saatlerinde 15. dakika | UEFA turnuva tabloları |
| Mizanpaj Editörü | Her saat 12 ve 42 | Kaynak/arşiv HTML'inin mobil, masaüstü ve geniş ekran denetimi |
| Birleşik Otomasyon Kontrolü | Kod değiştiğinde veya elle | Regresyon testleri, baş editör denemesi, tüm kaynak sayfalarının mizanpajı |

14 kök HTML sayfası vardır: index.html Baş Editöre, skor.html skor masasına, kalan 12 sayfa ilgili editöre bağlıdır. Araştırma rolü genel kategori turundan çıkarılmıştır; kendi vardiyasında çalışır.

## Kuyruk ve yayın

Dokuz yazıcı aynı golhat-content-writer grubunda queue: max kullanır. Bekleyen editör, yeni skor/lig çalışması geldiğinde iptal edilmez; tek yazıcı kuralı korunur. GitHub sınırı 100 bekleyen çalışmadır. Takvim hedef sıklıktır; gerçek zaman garantisi değildir.

TFF updatedAt değeri her kontrolde yenilenir; öncelikli maç masası yalnız puan, sıra, sezon veya fikstür içeriği gerçekten değiştiğinde tetiklenir. Kontrol saatinin değişmesi haber olayı sayılmaz.

Dört içerik yayıncısı (kategori, araştırma, baş editör, bütünlük) başarılı çalışmadan ve kaynak gönderiminden sonra scripts/publication-sync.js ile ortak arşivi eşitler. JSON yanıtta ok, storageReady, sourceReady doğru ve kayıt sayısı pozitif olmalıdır. Yönlendirme veya HTML yanıtı başarı sayılmaz. Geçici hatalar sınırlı yeniden denenir; kalıcı hata başarısız kalır. Başarısız editör çalışması başarı gibi eşitleme yapmaz. Skor/lig/kulüp JSON'larını yeni site doğrudan okur.

## Bütün ajanların ortak yönergesi

GOLHAT_MERGED_PUBLICATION_POLICY mevcut kaynak güvenliği ve [yayın politikası](YAYIN_POLITIKASI.md) ile bütün model editörlerine eklenir. Önemli doğrulanmış maç sonucu transfer söylentisinden önce gelir. Kart özeti tam haber değildir; ayrıntılı özgün gövde gerekir. Aynı olay tekrar üretilmez. Kaynak URL'leri doğrulama alanlarında saklanır; gövdeye dış bağlantı yazılmaz. Mustafa YILDIZ imzası yalnız somut, güncel ve kaynaklı maç/kulüp yorumunda kullanılır.

Model HTML yazamaz; şema, kaynak ve yinelenme kapıları korunur. Kaynak tarihi bilinmiyorsa tarih uydurulmaz; baş editör o tarih satırını atlar. Uzun köşe yazısı metinleri ortak stil ve üretici şablonunda taşmadan kırılır. Mizanpaj kapısı atlanmaz. İnsan muhabir kanıtı ve editör onayı olmadan Özel Haber üretilemez.

## Deneme

npm test tüm veri, kaynak, aktarım ve tetikleme testlerini çalıştırır. node scripts/run-editorial.js --head --dry-run anahtar veya yazma olmadan baş editör seçimini gösterir. Kategori araştırmasının dry-run seçeneği mevcut OPENAI_API_KEY Actions secret'ını kullanır. Anahtarlar depoya yazılmaz.

Yeni içerik yoksa haber üretilmez. Son kontrol bandının güncellenmesi yeni haber anlamına gelmez. Mizanpaj denetimi eski kaynak sayfalarını kapsar; yeni Sites arayüzünün görsel denetimi yerine geçmez.
