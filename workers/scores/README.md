# Cloudflare skor zamanlayıcısı

Üç dakikalık Cron, sağlayıcı zincirini doğrudan çağırıp D1'e yazar; GitHub dispatch veya token kullanılmaz. Haber üretmez/yayımlamaz.

İnceleme sonrası ayrı D1 oluşturulup gerçek kimliği wrangler yapılandırmasına yazılmalı, migration uygulanmalı ve Worker dağıtılmalı. API_FOOTBALL_KEY yalnız Worker Secret olarak girilir. Ücretli API paketi alınmaz. Varsayılan günlük birincil sağlayıcı sınırı 90; daha yüksek değer uygulanmaz. Yedek FotMob devam eder. SCORES_ENABLED=true açılışından önce sağlayıcı erişimi ve kullanım hakkı doğrulanmalı.

Okur Worker'a SCORES service binding adıyla bağlanır; istek http://scores/scores. Dış HTTP kapalıdır. Okur değişikliği ayrı daldadır. GitHub zamanlaması, canlı Cron kanıtlanana kadar korunur; geçişten sonra workflow_dispatch elle yedek olarak bırakılır, schedule kaldırılır. Arıza zamanında eski veriye yeni updatedAt yazılmaz.

29 Eylül canlı salt okunur kontrolü: FotMob HTTP 200, leagues/date şeması mevcut. Günün uluslararası maçları mevcut takip edilen lig listesine girmediği için sıfır eşleşme çıkabiliyor. Sıfır maç tek başına sağlayıcı hatası değildir. API-Football Secret değeri okunmadı; anahtar varlığı/geçerliliği canlı Worker kurulumunda doğrulanmalı.

Dağıtım ve trafik geçişi bu PR'da yapılmadı. Cron tazeliği canlıda henüz kanıtlanmadı.
