# GOLHAT GitHub Haber Merkezi

Bu depo, haber merkezi işini GitHub Actions üzerinde bilgisayardan bağımsız çalıştırır.

## İş akışları

- **GOLHAT Kategori Editörleri:** Her gün Türkiye saatiyle 08:20, 12:20, 16:20 ve 20:20.
- **GOLHAT Baş Editör:** Her gün Türkiye saatiyle 09:00, 13:00, 17:00 ve 21:00.
- **Canlı Skor Güncelleme:** Ayrı API-Football akışı olarak devam eder.

Üç iş akışı aynı golhat-content-writer kilidini kullanır. Böylece aynı anda iki commit/push işlemi yapılmaz.

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
