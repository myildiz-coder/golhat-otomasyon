# GOLHAT GitHub Haber Merkezi

Bu depo, haber merkezi işini GitHub Actions üzerinde bilgisayardan bağımsız çalıştırır.

## İş akışları

- **11 sayfa editörü:** Fenerbahçe, Galatasaray, Beşiktaş, Trabzonspor, Anadolu, Süper Lig, Avrupa ligleri, Şampiyonlar Ligi, UEFA Avrupa/Konferans, Transfer ve Özel Haber masaları üç saatte bir, günün 24 saati araştırma yapar.
- **GOLHAT Baş Editör:** Her saat ana sayfa bütünlüğünü denetler; yalnızca eşiği geçen doğrulanmış bir aday varsa model çağrısı yapar.
- **Manşet Arşivi:** Ana sayfaya çıkan her doğrulanmış dosya, sonraki manşet değişimlerinden etkilenmeden Özel Haber sayfasında en yeni kayıt üstte olacak biçimde birikir.
- **Ana Sayfa Bütünlük:** Manşet ile haber gövdesinin kopmasını 15 dakikada bir denetler ve doğrulanmış editöryel durumdan otomatik onarır.
- **Canlı Skor Güncelleme:** Gündüz 10, gece 30 dakikada bir çalışır. API-Football birincil, FotMob kesinti ve gece kotası yedeğidir.
- **Kulüp ve KAP Merkezi:** Dört büyüklerin resmî açıklama, futbol KAP bildirimi, kadro, form ve fikstür verisini iki saatte bir yeniler.
- **Lig veri masaları:** Süper Lig, UEFA turnuvaları ve altı Avrupa ligi puan/fikstür önbelleklerini gün boyunca yeniler.

Toplam 13 sayfanın her birinin tek sahibi vardır: `index.html` Baş Editöre, `skor.html` Canlı Skor masasına, diğer 11 sayfa kendi editörüne bağlıdır. Bu eşleme otomatik testle korunur; sahipsiz veya çift sahipli sayfa testi geçemez.

Tüm yazıcı iş akışları aynı `golhat-content-writer` kilidini kullanır. Böylece aynı anda iki commit/push işlemi yapılmaz.

## Ortak yayın politikası

Baş Editör ve tüm sayfa editörleri [GOLHAT Yayın Politikası](YAYIN_POLITIKASI.md) ile bağlıdır. Millî-muhafazakâr yayın kimliği; KKTC, Türk tarihi ve yabancı siyasi terminoloji için ortak anlatım çerçevesi sağlar. Bu çerçeve doğrulanmış skor, tarih, belge, alıntı veya karşıt kanıtın değiştirilmesine izin vermez.

## Yayın güvenliği

- Model yalnızca yapılandırılmış haber verisi üretir; doğrudan HTML yazamaz.
- Her haber en az iki farklı alan adındaki kaynağa dayanır.
- Modelin verdiği URL, OpenAI web araması sonuçlarında gerçekten görülmediyse haber reddedilir.
- Eski, yinelenen, izin verilmeyen sayfaya yönelen veya şema dışı haberler reddedilir.
- Otomatik kartlarda fotoğraf yoktur.
- Güncellenecek HTML yalnızca işaretli otomasyon bloğudur.
- Güçlü yeni haber yoksa dosyalara dokunulmaz.
- Baş Editör yalnızca daha önce doğrulanmış havuzdan seçim yapar; yeni bilgi üretemez.
- Ana sayfa değişimi günde en fazla üç kezdir. Yeni manşet ilk 12 saat içinde ancak en az 8 puan daha önemliyse mevcut manşetin yerini alabilir.

## Elle güvenli deneme

GitHub > Actions üzerinden ilgili iş akışını açıp **Run workflow** seçilir. dry_run varsayılan olarak açıktır; bu mod araştırma ve doğrulama yapar fakat dosya değiştirmez.

Yerel deneme:

    npm test
    node scripts/run-editorial.js --role fenerbahce --dry-run
    node scripts/run-editorial.js --head --dry-run

Yerelde OPENAI_API_KEY ortam değişkeni gerekir. Anahtar .env.local içinde tutulabilir; bu dosya Git tarafından yok sayılır. GitHub tarafında anahtar yalnızca OPENAI_API_KEY Actions secret'ında tutulur.
