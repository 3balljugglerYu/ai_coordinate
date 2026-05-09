import type {Locale} from "@/i18n/config";

const siteCopy = {
  ja: {
    title:
      "Persta.AI (ペルスタ) - 着てみたいも、なりたいも。AIスタイリングプラットフォーム",
    description:
      "Persta（ペルスタ）は、AIでファッション・キャラクターなどのビジュアル表現を自由にスタイリングできるプラットフォームです。persta.aiで、みんなの作品を見て、インスピレーションを得ましょう。",
  },
  en: {
    title:
      "Persta.AI - An AI styling platform for fashion, characters, and visual expression",
    description:
      "Persta is an AI styling platform where you can explore fashion, character, and visual expression ideas, then discover inspiration from the community on persta.ai.",
  },
  ko: {
    title:
      "Persta.AI — 패션, 캐릭터, 비주얼 표현을 위한 AI 스타일링 플랫폼",
    description:
      "Persta는 패션, 캐릭터, 비주얼 표현 아이디어를 자유롭게 스타일링할 수 있는 AI 플랫폼입니다. persta.ai에서 다른 사용자의 작품을 보고 영감을 얻어보세요.",
  },
  "zh-CN": {
    title:
      "Persta.AI — 时尚、角色和视觉表达的 AI 造型平台",
    description:
      "Persta 是一个 AI 造型平台，让你自由探索时尚、角色和视觉表达的创意。来 persta.ai 浏览社区作品，激发你的灵感。",
  },
  "zh-TW": {
    title:
      "Persta.AI — 時尚、角色與視覺表達的 AI 造型平台",
    description:
      "Persta 是一個 AI 造型平台，讓你自由探索時尚、角色與視覺表達的創意。來 persta.ai 瀏覽社群作品，激發你的靈感。",
  },
  es: {
    title:
      "Persta.AI — Plataforma de estilismo con IA para moda, personajes y expresión visual",
    description:
      "Persta es una plataforma de estilismo con IA donde puedes explorar ideas de moda, personajes y expresión visual, y descubrir inspiración de la comunidad en persta.ai.",
  },
  pt: {
    title:
      "Persta.AI — Plataforma de styling com IA para moda, personagens e expressão visual",
    description:
      "Persta é uma plataforma de styling com IA onde você pode explorar ideias de moda, personagens e expressão visual, e encontrar inspiração da comunidade em persta.ai.",
  },
  fr: {
    title:
      "Persta.AI — Plateforme de stylisme IA pour la mode, les personnages et l'expression visuelle",
    description:
      "Persta est une plateforme de stylisme IA où vous pouvez explorer des idées de mode, de personnages et d'expression visuelle, puis trouver l'inspiration auprès de la communauté sur persta.ai.",
  },
  de: {
    title:
      "Persta.AI – KI-Styling-Plattform für Mode, Charaktere und visuellen Ausdruck",
    description:
      "Persta ist eine KI-Styling-Plattform, auf der du Ideen für Mode, Charaktere und visuellen Ausdruck erkunden und dich von der Community auf persta.ai inspirieren lassen kannst.",
  },
  it: {
    title:
      "Persta.AI — Piattaforma di styling con IA per moda, personaggi ed espressione visiva",
    description:
      "Persta è una piattaforma di styling con IA in cui puoi esplorare idee di moda, personaggi ed espressione visiva, e trovare ispirazione dalla community su persta.ai.",
  },
  id: {
    title:
      "Persta.AI — Platform styling AI untuk fashion, karakter, dan ekspresi visual",
    description:
      "Persta adalah platform styling AI tempat kamu bisa menjelajahi ide fashion, karakter, dan ekspresi visual, lalu menemukan inspirasi dari komunitas di persta.ai.",
  },
  th: {
    title:
      "Persta.AI — แพลตฟอร์ม AI สไตลิ่งสำหรับแฟชั่น คาแรกเตอร์ และการแสดงออกทางภาพ",
    description:
      "Persta คือแพลตฟอร์ม AI สไตลิ่ง ที่คุณสามารถสำรวจไอเดียแฟชั่น คาแรกเตอร์ และการแสดงออกทางภาพ และค้นพบแรงบันดาลใจจากชุมชนได้ที่ persta.ai",
  },
  vi: {
    title:
      "Persta.AI — Nền tảng styling AI cho thời trang, nhân vật và biểu đạt hình ảnh",
    description:
      "Persta là nền tảng styling AI nơi bạn có thể khám phá ý tưởng thời trang, nhân vật và biểu đạt hình ảnh, đồng thời tìm cảm hứng từ cộng đồng tại persta.ai.",
  },
  hi: {
    title:
      "Persta.AI — फ़ैशन, किरदार और विज़ुअल अभिव्यक्ति के लिए AI स्टाइलिंग प्लैटफ़ॉर्म",
    description:
      "Persta एक AI स्टाइलिंग प्लैटफ़ॉर्म है जहाँ आप फ़ैशन, किरदार और विज़ुअल अभिव्यक्ति के आइडिया एक्सप्लोर कर सकते हैं और persta.ai पर कम्यूनिटी से प्रेरणा पा सकते हैं।",
  },
  ar: {
    title:
      "Persta.AI — منصّة تنسيق المظهر بالذكاء الاصطناعي للأزياء والشخصيات والتعبير البصري",
    description:
      "Persta منصّة تنسيق مظهر تعتمد على الذكاء الاصطناعي، تتيح لك استكشاف أفكار الأزياء والشخصيات والتعبير البصري، والاستلهام من أعمال المجتمع على persta.ai.",
  },
} as const satisfies Record<Locale, {title: string; description: string}>;

const homeCopy = {
  ja: {
    metadataTitle: "Persta.AI (ペルスタ)",
    metadataDescription: "着てみたいも、なりたいも。AIスタイリングプラットフォーム",
    heading: "Persta | ペルスタ",
    subtitle: "着てみたいも、なりたいも。AIスタイリングプラットフォーム",
    organizationDescription:
      "Persta（ペルスタ）は、AIでファッション・キャラクターなどのビジュアル表現を自由にスタイリングできるプラットフォームです。",
  },
  en: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "An AI styling platform for the looks and characters you want to create.",
    heading: "Persta",
    subtitle:
      "An AI styling platform for the looks and characters you want to create.",
    organizationDescription:
      "Persta is an AI styling platform for freely styling fashion, characters, and other visual ideas.",
  },
  ko: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "입고 싶은 모습도, 되고 싶은 모습도. AI 스타일링 플랫폼.",
    heading: "Persta",
    subtitle: "입고 싶은 모습도, 되고 싶은 모습도. AI 스타일링 플랫폼.",
    organizationDescription:
      "Persta는 패션, 캐릭터 등 비주얼 표현을 자유롭게 스타일링할 수 있는 AI 플랫폼입니다.",
  },
  "zh-CN": {
    metadataTitle: "Persta.AI",
    metadataDescription: "想穿的样子，想成为的样子。AI 造型平台。",
    heading: "Persta",
    subtitle: "想穿的样子，想成为的样子。AI 造型平台。",
    organizationDescription:
      "Persta 是一个 AI 造型平台，让你自由探索时尚、角色等视觉表达的创意。",
  },
  "zh-TW": {
    metadataTitle: "Persta.AI",
    metadataDescription: "想穿的樣子，想成為的樣子。AI 造型平台。",
    heading: "Persta",
    subtitle: "想穿的樣子，想成為的樣子。AI 造型平台。",
    organizationDescription:
      "Persta 是一個 AI 造型平台，讓你自由探索時尚、角色等視覺表達的創意。",
  },
  es: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "Lo que quieres llevar, lo que quieres ser. Plataforma de estilismo con IA.",
    heading: "Persta",
    subtitle:
      "Lo que quieres llevar, lo que quieres ser. Plataforma de estilismo con IA.",
    organizationDescription:
      "Persta es una plataforma de estilismo con IA para explorar libremente moda, personajes y otras expresiones visuales.",
  },
  pt: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "O que você quer vestir, quem você quer ser. Plataforma de styling com IA.",
    heading: "Persta",
    subtitle:
      "O que você quer vestir, quem você quer ser. Plataforma de styling com IA.",
    organizationDescription:
      "Persta é uma plataforma de styling com IA para explorar livremente moda, personagens e outras expressões visuais.",
  },
  fr: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "Ce que vous voulez porter, ce que vous voulez devenir. Plateforme de stylisme IA.",
    heading: "Persta",
    subtitle:
      "Ce que vous voulez porter, ce que vous voulez devenir. Plateforme de stylisme IA.",
    organizationDescription:
      "Persta est une plateforme de stylisme IA qui vous permet d'explorer librement la mode, les personnages et d'autres expressions visuelles.",
  },
  de: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "Was du tragen willst, wer du sein willst. KI-Styling-Plattform.",
    heading: "Persta",
    subtitle: "Was du tragen willst, wer du sein willst. KI-Styling-Plattform.",
    organizationDescription:
      "Persta ist eine KI-Styling-Plattform, auf der du Mode, Charaktere und andere visuelle Ausdrucksformen frei erkunden kannst.",
  },
  it: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "Quello che vuoi indossare, quello che vuoi essere. Piattaforma di styling con IA.",
    heading: "Persta",
    subtitle:
      "Quello che vuoi indossare, quello che vuoi essere. Piattaforma di styling con IA.",
    organizationDescription:
      "Persta è una piattaforma di styling con IA per esplorare liberamente moda, personaggi e altre espressioni visive.",
  },
  id: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "Yang ingin kamu pakai, yang ingin kamu jadikan. Platform styling AI.",
    heading: "Persta",
    subtitle:
      "Yang ingin kamu pakai, yang ingin kamu jadikan. Platform styling AI.",
    organizationDescription:
      "Persta adalah platform styling AI tempat kamu bisa bebas menjelajahi fashion, karakter, dan ekspresi visual lainnya.",
  },
  th: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "สิ่งที่อยากใส่ สิ่งที่อยากเป็น แพลตฟอร์ม AI สไตลิ่ง",
    heading: "Persta",
    subtitle: "สิ่งที่อยากใส่ สิ่งที่อยากเป็น แพลตฟอร์ม AI สไตลิ่ง",
    organizationDescription:
      "Persta คือแพลตฟอร์ม AI สไตลิ่ง ที่คุณสามารถสำรวจไอเดียแฟชั่น คาแรกเตอร์ และการแสดงออกทางภาพอื่น ๆ ได้อย่างอิสระ",
  },
  vi: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "Điều bạn muốn mặc, điều bạn muốn trở thành. Nền tảng styling AI.",
    heading: "Persta",
    subtitle:
      "Điều bạn muốn mặc, điều bạn muốn trở thành. Nền tảng styling AI.",
    organizationDescription:
      "Persta là nền tảng styling AI cho phép bạn tự do khám phá thời trang, nhân vật và các hình thức biểu đạt hình ảnh khác.",
  },
  hi: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "जो पहनना चाहें, जो बनना चाहें — AI स्टाइलिंग प्लैटफ़ॉर्म।",
    heading: "Persta",
    subtitle: "जो पहनना चाहें, जो बनना चाहें — AI स्टाइलिंग प्लैटफ़ॉर्म।",
    organizationDescription:
      "Persta एक AI स्टाइलिंग प्लैटफ़ॉर्म है जहाँ आप फ़ैशन, किरदार और दूसरे विज़ुअल एक्सप्रेशन को आज़ादी से एक्सप्लोर कर सकते हैं।",
  },
  ar: {
    metadataTitle: "Persta.AI",
    metadataDescription:
      "ما تريد ارتداءه، ومن تريد أن تكون. منصّة تنسيق المظهر بالذكاء الاصطناعي.",
    heading: "Persta",
    subtitle:
      "ما تريد ارتداءه، ومن تريد أن تكون. منصّة تنسيق المظهر بالذكاء الاصطناعي.",
    organizationDescription:
      "Persta منصّة تنسيق مظهر بالذكاء الاصطناعي تتيح لك استكشاف الأزياء والشخصيات وأشكال التعبير البصري الأخرى بحرية.",
  },
} as const satisfies Record<
  Locale,
  {
    metadataTitle: string;
    metadataDescription: string;
    heading: string;
    subtitle: string;
    organizationDescription: string;
  }
>;

const freeMaterialsCopy = {
  ja: {
    title: "着せ替えお試し用素材 | Persta.AI",
    description:
      "こちらに掲載しているイラストは、Perstaで着せ替えを試すために、自由にダウンロードして利用できる素材ページです。お好きな画像をダウンロードして、ぜひ着せ替えをお試しください！",
    ogTitle: "着せ替えお試し用素材",
    ogDescription:
      "Perstaで着せ替えを試すためのフリー素材。イラストをダウンロードして着せ替えをお試しください。",
    heading: "着せ替えフリー素材",
    body:
      "Perstaで着せ替えを試せるイラスト素材です。画像はダウンロードしてご利用ください。",
    mobileHint: "※モバイル端末では画像を長押しすると保存できます。",
  },
  en: {
    title: "Free Outfit Test Assets | Persta.AI",
    description:
      "Download free illustration assets from this page and try outfit swaps in Persta with your favorite image.",
    ogTitle: "Free Outfit Test Assets",
    ogDescription:
      "Free illustration assets for trying outfit swaps in Persta. Download an image and start experimenting.",
    heading: "Free outfit test assets",
    body:
      "These illustrations are free assets for trying outfit swaps in Persta. Download any image and use it freely.",
    mobileHint: "On mobile devices, press and hold an image to save it.",
  },
  ko: {
    title: "옷 갈아입히기용 무료 소재 | Persta.AI",
    description:
      "이 페이지의 일러스트는 Persta에서 옷 갈아입히기를 체험하기 위해 자유롭게 다운로드해 사용할 수 있는 소재입니다. 마음에 드는 이미지를 다운로드해 옷 갈아입히기를 즐겨보세요.",
    ogTitle: "옷 갈아입히기 무료 소재",
    ogDescription:
      "Persta에서 옷 갈아입히기를 체험할 수 있는 무료 일러스트 소재. 이미지를 다운로드해 시도해 보세요.",
    heading: "옷 갈아입히기 무료 소재",
    body:
      "Persta에서 옷 갈아입히기를 시험해 볼 수 있는 일러스트 소재입니다. 이미지는 다운로드해서 사용하세요.",
    mobileHint: "※모바일 기기에서는 이미지를 길게 눌러 저장할 수 있습니다.",
  },
  "zh-CN": {
    title: "换装试玩免费素材 | Persta.AI",
    description:
      "本页面提供可自由下载的插画素材，方便你在 Persta 体验换装功能。请挑选喜欢的图片下载并试试看吧。",
    ogTitle: "换装试玩免费素材",
    ogDescription:
      "可在 Persta 体验换装的免费插画素材。请下载图片并开始尝试。",
    heading: "换装免费素材",
    body:
      "这些是可在 Persta 体验换装的插画素材。请自由下载并使用。",
    mobileHint: "※在移动设备上，长按图片即可保存。",
  },
  "zh-TW": {
    title: "換裝試玩免費素材 | Persta.AI",
    description:
      "本頁面提供可自由下載的插畫素材，方便你在 Persta 體驗換裝功能。請挑選喜歡的圖片下載並試試看。",
    ogTitle: "換裝試玩免費素材",
    ogDescription:
      "可在 Persta 體驗換裝的免費插畫素材。請下載圖片並開始嘗試。",
    heading: "換裝免費素材",
    body:
      "這些是可在 Persta 體驗換裝的插畫素材。請自由下載並使用。",
    mobileHint: "※在行動裝置上，長按圖片即可儲存。",
  },
  es: {
    title: "Recursos gratuitos para probar cambios de outfit | Persta.AI",
    description:
      "Descarga ilustraciones gratuitas desde esta página y prueba los cambios de outfit en Persta con tu imagen favorita.",
    ogTitle: "Recursos gratuitos para outfit",
    ogDescription:
      "Ilustraciones gratuitas para probar cambios de outfit en Persta. Descarga una imagen y empieza a experimentar.",
    heading: "Recursos gratuitos de outfit",
    body:
      "Estas ilustraciones son recursos gratuitos para probar cambios de outfit en Persta. Descarga cualquier imagen y úsala libremente.",
    mobileHint:
      "En dispositivos móviles, mantén pulsada la imagen para guardarla.",
  },
  pt: {
    title: "Recursos gratuitos para testar troca de outfit | Persta.AI",
    description:
      "Baixe ilustrações gratuitas desta página e teste a troca de outfit no Persta com sua imagem favorita.",
    ogTitle: "Recursos gratuitos para outfit",
    ogDescription:
      "Ilustrações gratuitas para testar troca de outfit no Persta. Baixe uma imagem e comece a experimentar.",
    heading: "Recursos gratuitos de outfit",
    body:
      "Estas ilustrações são recursos gratuitos para testar a troca de outfit no Persta. Baixe qualquer imagem e use livremente.",
    mobileHint:
      "Em dispositivos móveis, pressione e segure a imagem para salvá-la.",
  },
  fr: {
    title:
      "Ressources gratuites pour tester les changements de tenue | Persta.AI",
    description:
      "Téléchargez des illustrations gratuites depuis cette page et essayez les changements de tenue sur Persta avec votre image préférée.",
    ogTitle: "Ressources gratuites pour les tenues",
    ogDescription:
      "Illustrations gratuites pour tester les changements de tenue sur Persta. Téléchargez une image et commencez à expérimenter.",
    heading: "Ressources gratuites pour les tenues",
    body:
      "Ces illustrations sont des ressources gratuites pour tester les changements de tenue sur Persta. Téléchargez n'importe quelle image et utilisez-la librement.",
    mobileHint:
      "Sur mobile, appuyez longuement sur une image pour l'enregistrer.",
  },
  de: {
    title: "Kostenlose Assets für Outfit-Tests | Persta.AI",
    description:
      "Lade dir auf dieser Seite kostenlose Illustrationen herunter und probiere mit deinem Lieblingsbild Outfit-Wechsel in Persta aus.",
    ogTitle: "Kostenlose Outfit-Test-Assets",
    ogDescription:
      "Kostenlose Illustrationen, um Outfit-Wechsel in Persta auszuprobieren. Lade ein Bild herunter und leg los.",
    heading: "Kostenlose Outfit-Assets",
    body:
      "Diese Illustrationen sind kostenlose Assets, um Outfit-Wechsel in Persta auszuprobieren. Lade ein beliebiges Bild herunter und nutze es frei.",
    mobileHint:
      "Auf Mobilgeräten kannst du ein Bild speichern, indem du es länger gedrückt hältst.",
  },
  it: {
    title: "Risorse gratuite per provare i cambi di outfit | Persta.AI",
    description:
      "Scarica illustrazioni gratuite da questa pagina e prova i cambi di outfit su Persta con la tua immagine preferita.",
    ogTitle: "Risorse gratuite per gli outfit",
    ogDescription:
      "Illustrazioni gratuite per provare i cambi di outfit su Persta. Scarica un'immagine e inizia a sperimentare.",
    heading: "Risorse gratuite per gli outfit",
    body:
      "Queste illustrazioni sono risorse gratuite per provare i cambi di outfit su Persta. Scarica qualsiasi immagine e usala liberamente.",
    mobileHint:
      "Su dispositivi mobili, tieni premuta l'immagine per salvarla.",
  },
  id: {
    title: "Aset gratis untuk mencoba ganti outfit | Persta.AI",
    description:
      "Unduh ilustrasi gratis dari halaman ini dan coba ganti outfit di Persta dengan gambar favoritmu.",
    ogTitle: "Aset gratis untuk outfit",
    ogDescription:
      "Ilustrasi gratis untuk mencoba ganti outfit di Persta. Unduh gambarnya dan mulai bereksperimen.",
    heading: "Aset outfit gratis",
    body:
      "Ilustrasi ini adalah aset gratis untuk mencoba ganti outfit di Persta. Silakan unduh gambar mana pun dan gunakan dengan bebas.",
    mobileHint: "Di perangkat seluler, tekan dan tahan gambar untuk menyimpannya.",
  },
  th: {
    title: "ภาพฟรีสำหรับทดลองเปลี่ยนชุด | Persta.AI",
    description:
      "ดาวน์โหลดภาพประกอบฟรีจากหน้านี้ และลองเปลี่ยนชุดบน Persta ด้วยรูปที่คุณชอบได้เลย",
    ogTitle: "ภาพฟรีสำหรับเปลี่ยนชุด",
    ogDescription:
      "ภาพประกอบฟรีสำหรับลองเปลี่ยนชุดบน Persta ดาวน์โหลดรูปแล้วเริ่มทดลองได้เลย",
    heading: "ภาพฟรีสำหรับเปลี่ยนชุด",
    body:
      "ภาพประกอบเหล่านี้เป็นไฟล์ฟรีสำหรับลองเปลี่ยนชุดบน Persta สามารถดาวน์โหลดและใช้งานได้อย่างอิสระ",
    mobileHint: "※บนมือถือ กดค้างที่ภาพเพื่อบันทึก",
  },
  vi: {
    title: "Tài nguyên miễn phí để thử đổi trang phục | Persta.AI",
    description:
      "Tải ảnh minh họa miễn phí từ trang này và thử đổi trang phục trên Persta với hình ảnh bạn yêu thích.",
    ogTitle: "Tài nguyên miễn phí cho trang phục",
    ogDescription:
      "Ảnh minh họa miễn phí để thử đổi trang phục trên Persta. Tải hình về và bắt đầu thử nghiệm.",
    heading: "Tài nguyên trang phục miễn phí",
    body:
      "Đây là các ảnh minh họa miễn phí để thử đổi trang phục trên Persta. Hãy tải ảnh về và sử dụng tự do.",
    mobileHint:
      "Trên thiết bị di động, nhấn và giữ hình ảnh để lưu lại.",
  },
  hi: {
    title: "आउटफिट बदलकर ट्राय करने के लिए मुफ़्त असेट | Persta.AI",
    description:
      "इस पेज से मुफ़्त इलस्ट्रेशन डाउनलोड करें और अपनी पसंद की तस्वीर के साथ Persta पर आउटफिट बदलकर ट्राय करें।",
    ogTitle: "आउटफिट के लिए मुफ़्त असेट",
    ogDescription:
      "Persta पर आउटफिट बदलकर ट्राय करने के लिए मुफ़्त इलस्ट्रेशन। एक इमेज डाउनलोड करें और एक्सपेरिमेंट शुरू करें।",
    heading: "मुफ़्त आउटफिट असेट",
    body:
      "ये इलस्ट्रेशन Persta पर आउटफिट बदलकर ट्राय करने के लिए मुफ़्त असेट हैं। कोई भी इमेज डाउनलोड करके आज़ादी से इस्तेमाल करें।",
    mobileHint:
      "मोबाइल डिवाइस पर, इमेज को सेव करने के लिए लंबे समय तक दबाकर रखें।",
  },
  ar: {
    title: "موارد مجّانية لتجربة تبديل الإطلالات | Persta.AI",
    description:
      "نزّل رسومات مجّانية من هذه الصفحة وجرّب تبديل الإطلالات على Persta باستخدام صورتك المفضّلة.",
    ogTitle: "موارد مجّانية للإطلالات",
    ogDescription:
      "رسومات مجّانية لتجربة تبديل الإطلالات على Persta. نزّل صورة وابدأ التجربة.",
    heading: "موارد إطلالات مجّانية",
    body:
      "هذه الرسومات موارد مجّانية لتجربة تبديل الإطلالات على Persta. نزّل أيّ صورة واستخدمها بحرّية.",
    mobileHint: "على الأجهزة المحمولة، اضغط مع الاستمرار على الصورة لحفظها.",
  },
} as const satisfies Record<
  Locale,
  {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
    heading: string;
    body: string;
    mobileHint: string;
  }
>;

const searchCopy = {
  ja: {
    defaultTitle: "検索 - Persta.AI",
    defaultDescription:
      "プロンプトを検索して、好きなファッションやキャラクターを見つけましょう",
    resultTitle: "{query}の検索結果 - Persta.AI",
    resultDescription:
      "「{query}」のコーデ・ファッション・キャラクター画像を検索。Persta.AIでみんなの作品を見つけましょう。",
    emptyQuery: "検索キーワードを入力してください",
  },
  en: {
    defaultTitle: "Search - Persta.AI",
    defaultDescription:
      "Search prompts to discover fashion looks and characters you like.",
    resultTitle: "Results for {query} - Persta.AI",
    resultDescription:
      "Search Persta.AI for fashion, styling, and character images related to “{query}”.",
    emptyQuery: "Enter a keyword to start searching.",
  },
  ko: {
    defaultTitle: "검색 - Persta.AI",
    defaultDescription:
      "프롬프트를 검색해 좋아하는 패션과 캐릭터를 찾아보세요.",
    resultTitle: "{query} 검색 결과 - Persta.AI",
    resultDescription:
      "“{query}” 관련 패션, 스타일링, 캐릭터 이미지를 Persta.AI에서 검색해 보세요.",
    emptyQuery: "검색어를 입력해 주세요.",
  },
  "zh-CN": {
    defaultTitle: "搜索 - Persta.AI",
    defaultDescription: "搜索提示词，发现你喜欢的穿搭和角色。",
    resultTitle: "“{query}” 的搜索结果 - Persta.AI",
    resultDescription:
      "在 Persta.AI 搜索与“{query}”相关的穿搭、时尚和角色图片。",
    emptyQuery: "请输入搜索关键词。",
  },
  "zh-TW": {
    defaultTitle: "搜尋 - Persta.AI",
    defaultDescription: "搜尋提示詞，發現你喜歡的穿搭與角色。",
    resultTitle: "「{query}」的搜尋結果 - Persta.AI",
    resultDescription:
      "在 Persta.AI 搜尋與「{query}」相關的穿搭、時尚與角色圖片。",
    emptyQuery: "請輸入搜尋關鍵字。",
  },
  es: {
    defaultTitle: "Buscar - Persta.AI",
    defaultDescription:
      "Busca prompts para descubrir looks y personajes que te gusten.",
    resultTitle: "Resultados para {query} - Persta.AI",
    resultDescription:
      "Busca en Persta.AI imágenes de moda, estilismo y personajes relacionadas con “{query}”.",
    emptyQuery: "Introduce una palabra clave para empezar a buscar.",
  },
  pt: {
    defaultTitle: "Buscar - Persta.AI",
    defaultDescription:
      "Pesquise prompts para descobrir looks e personagens que você gosta.",
    resultTitle: "Resultados para {query} - Persta.AI",
    resultDescription:
      "Pesquise no Persta.AI imagens de moda, styling e personagens relacionadas a “{query}”.",
    emptyQuery: "Digite uma palavra-chave para começar a buscar.",
  },
  fr: {
    defaultTitle: "Rechercher - Persta.AI",
    defaultDescription:
      "Recherchez des prompts pour découvrir des looks et des personnages qui vous plaisent.",
    resultTitle: "Résultats pour {query} - Persta.AI",
    resultDescription:
      "Recherchez sur Persta.AI des images de mode, de stylisme et de personnages liées à « {query} ».",
    emptyQuery: "Saisissez un mot-clé pour commencer la recherche.",
  },
  de: {
    defaultTitle: "Suche – Persta.AI",
    defaultDescription:
      "Suche Prompts, um Looks und Charaktere zu entdecken, die dir gefallen.",
    resultTitle: "Ergebnisse für {query} – Persta.AI",
    resultDescription:
      "Suche auf Persta.AI Mode-, Styling- und Charakterbilder zu „{query}“.",
    emptyQuery: "Gib ein Stichwort ein, um die Suche zu starten.",
  },
  it: {
    defaultTitle: "Cerca - Persta.AI",
    defaultDescription:
      "Cerca prompt per scoprire look e personaggi che ti piacciono.",
    resultTitle: "Risultati per {query} - Persta.AI",
    resultDescription:
      "Cerca su Persta.AI immagini di moda, styling e personaggi correlate a “{query}”.",
    emptyQuery: "Inserisci una parola chiave per iniziare la ricerca.",
  },
  id: {
    defaultTitle: "Cari - Persta.AI",
    defaultDescription:
      "Cari prompt untuk menemukan look dan karakter yang kamu suka.",
    resultTitle: "Hasil untuk {query} - Persta.AI",
    resultDescription:
      "Cari di Persta.AI gambar fashion, styling, dan karakter terkait “{query}”.",
    emptyQuery: "Masukkan kata kunci untuk mulai mencari.",
  },
  th: {
    defaultTitle: "ค้นหา - Persta.AI",
    defaultDescription:
      "ค้นหาพรอมป์เพื่อค้นพบลุคและคาแรกเตอร์ที่คุณชอบ",
    resultTitle: "ผลการค้นหา {query} - Persta.AI",
    resultDescription:
      "ค้นหาภาพแฟชั่น สไตลิ่ง และคาแรกเตอร์ที่เกี่ยวข้องกับ “{query}” บน Persta.AI",
    emptyQuery: "กรุณาป้อนคำค้นหา",
  },
  vi: {
    defaultTitle: "Tìm kiếm - Persta.AI",
    defaultDescription:
      "Tìm kiếm prompt để khám phá những bộ trang phục và nhân vật bạn yêu thích.",
    resultTitle: "Kết quả cho {query} - Persta.AI",
    resultDescription:
      "Tìm trên Persta.AI các hình ảnh thời trang, styling và nhân vật liên quan đến “{query}”.",
    emptyQuery: "Hãy nhập từ khóa để bắt đầu tìm kiếm.",
  },
  hi: {
    defaultTitle: "खोजें - Persta.AI",
    defaultDescription:
      "प्रॉम्प्ट खोजें और अपनी पसंद के लुक और किरदार ढूँढें।",
    resultTitle: "{query} के लिए नतीजे - Persta.AI",
    resultDescription:
      "Persta.AI पर “{query}” से जुड़े फ़ैशन, स्टाइलिंग और किरदारों की तस्वीरें खोजें।",
    emptyQuery: "खोज शुरू करने के लिए कोई कीवर्ड डालें।",
  },
  ar: {
    defaultTitle: "البحث - Persta.AI",
    defaultDescription:
      "ابحث عن المطالبات (Prompts) لاكتشاف إطلالات وشخصيات تعجبك.",
    resultTitle: "نتائج البحث عن {query} - Persta.AI",
    resultDescription:
      "ابحث في Persta.AI عن صور أزياء وتنسيق وشخصيات مرتبطة بـ ”{query}“.",
    emptyQuery: "أدخل كلمة مفتاحية لبدء البحث.",
  },
} as const satisfies Record<
  Locale,
  {
    defaultTitle: string;
    defaultDescription: string;
    resultTitle: string;
    resultDescription: string;
    emptyQuery: string;
  }
>;

const postPageCopy = {
  ja: {
    fallbackDescription: "Persta.AIで作成したコーデ画像です。",
    fallbackAlt: "Persta.AI 投稿画像",
    notFoundTitle: "投稿が見つかりません | Persta.AI",
    notFoundDescription: "指定された投稿は見つかりませんでした。",
  },
  en: {
    fallbackDescription: "A styling image created on Persta.AI.",
    fallbackAlt: "Persta.AI post image",
    notFoundTitle: "Post not found | Persta.AI",
    notFoundDescription: "The requested post could not be found.",
  },
  ko: {
    fallbackDescription: "Persta.AI에서 만든 스타일링 이미지입니다.",
    fallbackAlt: "Persta.AI 게시물 이미지",
    notFoundTitle: "게시물을 찾을 수 없습니다 | Persta.AI",
    notFoundDescription: "요청하신 게시물을 찾을 수 없습니다.",
  },
  "zh-CN": {
    fallbackDescription: "在 Persta.AI 上创建的造型图片。",
    fallbackAlt: "Persta.AI 帖子图片",
    notFoundTitle: "未找到帖子 | Persta.AI",
    notFoundDescription: "未找到指定的帖子。",
  },
  "zh-TW": {
    fallbackDescription: "在 Persta.AI 上建立的造型圖片。",
    fallbackAlt: "Persta.AI 貼文圖片",
    notFoundTitle: "找不到貼文 | Persta.AI",
    notFoundDescription: "找不到指定的貼文。",
  },
  es: {
    fallbackDescription: "Una imagen de estilismo creada en Persta.AI.",
    fallbackAlt: "Imagen de publicación de Persta.AI",
    notFoundTitle: "Publicación no encontrada | Persta.AI",
    notFoundDescription: "No se pudo encontrar la publicación solicitada.",
  },
  pt: {
    fallbackDescription: "Uma imagem de styling criada no Persta.AI.",
    fallbackAlt: "Imagem de post do Persta.AI",
    notFoundTitle: "Post não encontrado | Persta.AI",
    notFoundDescription: "Não foi possível encontrar o post solicitado.",
  },
  fr: {
    fallbackDescription: "Une image de stylisme créée sur Persta.AI.",
    fallbackAlt: "Image de publication Persta.AI",
    notFoundTitle: "Publication introuvable | Persta.AI",
    notFoundDescription: "La publication demandée est introuvable.",
  },
  de: {
    fallbackDescription: "Ein auf Persta.AI erstelltes Styling-Bild.",
    fallbackAlt: "Persta.AI Beitragsbild",
    notFoundTitle: "Beitrag nicht gefunden | Persta.AI",
    notFoundDescription: "Der angeforderte Beitrag wurde nicht gefunden.",
  },
  it: {
    fallbackDescription: "Un'immagine di styling creata su Persta.AI.",
    fallbackAlt: "Immagine del post di Persta.AI",
    notFoundTitle: "Post non trovato | Persta.AI",
    notFoundDescription: "Il post richiesto non è stato trovato.",
  },
  id: {
    fallbackDescription: "Gambar styling yang dibuat di Persta.AI.",
    fallbackAlt: "Gambar postingan Persta.AI",
    notFoundTitle: "Postingan tidak ditemukan | Persta.AI",
    notFoundDescription: "Postingan yang diminta tidak dapat ditemukan.",
  },
  th: {
    fallbackDescription: "ภาพสไตลิ่งที่สร้างบน Persta.AI",
    fallbackAlt: "ภาพโพสต์ของ Persta.AI",
    notFoundTitle: "ไม่พบโพสต์ | Persta.AI",
    notFoundDescription: "ไม่พบโพสต์ที่คุณค้นหา",
  },
  vi: {
    fallbackDescription: "Hình ảnh styling được tạo trên Persta.AI.",
    fallbackAlt: "Hình ảnh bài đăng Persta.AI",
    notFoundTitle: "Không tìm thấy bài đăng | Persta.AI",
    notFoundDescription: "Không thể tìm thấy bài đăng yêu cầu.",
  },
  hi: {
    fallbackDescription: "Persta.AI पर बनाई गई स्टाइलिंग इमेज।",
    fallbackAlt: "Persta.AI पोस्ट इमेज",
    notFoundTitle: "पोस्ट नहीं मिली | Persta.AI",
    notFoundDescription: "अनुरोधित पोस्ट नहीं मिल पाई।",
  },
  ar: {
    fallbackDescription: "صورة تنسيق تم إنشاؤها على Persta.AI.",
    fallbackAlt: "صورة منشور على Persta.AI",
    notFoundTitle: "المنشور غير موجود | Persta.AI",
    notFoundDescription: "تعذّر العثور على المنشور المطلوب.",
  },
} as const satisfies Record<
  Locale,
  {
    fallbackDescription: string;
    fallbackAlt: string;
    notFoundTitle: string;
    notFoundDescription: string;
  }
>;

export function getSiteCopy(locale: Locale) {
  return siteCopy[locale];
}

export function getHomeCopy(locale: Locale) {
  return homeCopy[locale];
}

export function getFreeMaterialsCopy(locale: Locale) {
  return freeMaterialsCopy[locale];
}

export function getSearchCopy(locale: Locale) {
  return searchCopy[locale];
}

export function getPostPageCopy(locale: Locale) {
  return postPageCopy[locale];
}
