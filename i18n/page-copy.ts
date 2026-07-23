import type {Locale} from "@/i18n/config";

const siteCopy = {
  ja: {
    title:
      "Persta.AI (ペルスタ) - AI着せ替え・AIイラスト生成のスタイリングプラットフォーム",
    description:
      "Persta（ペルスタ）は、うちの子・推しキャラのイラストをAIで着せ替え・コーディネートできるAIイラスト生成プラットフォームです。無料で試して、persta.aiでみんなの作品からインスピレーションを得ましょう。",
  },
  en: {
    title:
      "Persta.AI - AI Dress-Up, Outfit Swap & Character Illustration Generator",
    description:
      "Persta is an AI platform for dressing up your OCs and favorite characters: generate outfit swaps, coordinated looks, and new illustration styles, then discover inspiration from the community on persta.ai.",
  },
  ko: {
    title:
      "Persta.AI — AI 옷 갈아입히기·AI 일러스트 생성 스타일링 플랫폼",
    description:
      "Persta는 내 캐릭터(오리캐)와 최애 일러스트를 AI로 옷 갈아입히기·코디할 수 있는 AI 일러스트 생성 플랫폼입니다. 무료로 체험하고 persta.ai에서 다른 사용자의 작품을 보고 영감을 얻어보세요.",
  },
  "zh-CN": {
    title:
      "Persta.AI — AI 换装与 AI 插画生成的造型平台",
    description:
      "Persta 是一个 AI 插画生成平台，用 AI 为你的自设角色（OC）和本命角色换装、搭配服装。免费体验，并在 persta.ai 浏览社区作品，激发你的灵感。",
  },
  "zh-TW": {
    title:
      "Persta.AI — AI 換裝與 AI 插畫生成的造型平台",
    description:
      "Persta 是一個 AI 插畫生成平台，用 AI 為你的自創角色（OC）和本命角色換裝、搭配服裝。免費體驗，並在 persta.ai 瀏覽社群作品，激發你的靈感。",
  },
  es: {
    title:
      "Persta.AI — Cambio de ropa con IA y generación de ilustraciones de personajes",
    description:
      "Persta es una plataforma de IA para vestir a tus OCs y personajes favoritos: genera cambios de outfit, looks coordinados y nuevos estilos de ilustración. Pruébalo gratis y descubre inspiración de la comunidad en persta.ai.",
  },
  pt: {
    title:
      "Persta.AI — Troca de roupa com IA e geração de ilustrações de personagens",
    description:
      "Persta é uma plataforma de IA para vestir seus OCs e personagens favoritos: gere trocas de roupa, looks coordenados e novos estilos de ilustração. Experimente grátis e encontre inspiração da comunidade em persta.ai.",
  },
  fr: {
    title:
      "Persta.AI — Habillage IA et génération d'illustrations de personnages",
    description:
      "Persta est une plateforme d'IA pour habiller vos OC et personnages préférés : générez des changements de tenue, des looks coordonnés et de nouveaux styles d'illustration. Essayez gratuitement et trouvez l'inspiration auprès de la communauté sur persta.ai.",
  },
  de: {
    title:
      "Persta.AI – KI-Anziehen & KI-Illustrationsgenerator für Charaktere",
    description:
      "Persta ist eine KI-Plattform, mit der du deine OCs und Lieblingscharaktere umziehst: Erstelle Outfit-Wechsel, abgestimmte Looks und neue Illustrationsstile. Kostenlos ausprobieren und dich von der Community auf persta.ai inspirieren lassen.",
  },
  it: {
    title:
      "Persta.AI — Cambio d'abito con IA e generazione di illustrazioni di personaggi",
    description:
      "Persta è una piattaforma di IA per vestire i tuoi OC e personaggi preferiti: genera cambi d'abito, look coordinati e nuovi stili di illustrazione. Provala gratis e trova ispirazione dalla community su persta.ai.",
  },
  id: {
    title:
      "Persta.AI — Ganti baju AI & generator ilustrasi karakter",
    description:
      "Persta adalah platform AI untuk mendandani OC dan karakter favoritmu: buat pergantian outfit, padu padan gaya, dan gaya ilustrasi baru. Coba gratis dan temukan inspirasi dari komunitas di persta.ai.",
  },
  th: {
    title:
      "Persta.AI — แพลตฟอร์ม AI เปลี่ยนชุดตัวละครและสร้างภาพประกอบด้วย AI",
    description:
      "Persta คือแพลตฟอร์ม AI สำหรับเปลี่ยนชุดให้ OC และตัวละครที่คุณรัก สร้างการเปลี่ยนชุด การแต่งตัว และสไตล์ภาพประกอบใหม่ ๆ ทดลองฟรีและค้นพบแรงบันดาลใจจากชุมชนได้ที่ persta.ai",
  },
  vi: {
    title:
      "Persta.AI — Thay trang phục AI & tạo ảnh minh họa nhân vật bằng AI",
    description:
      "Persta là nền tảng AI giúp thay trang phục cho OC và nhân vật yêu thích của bạn: tạo outfit mới, phối đồ và các phong cách minh họa khác nhau. Dùng thử miễn phí và tìm cảm hứng từ cộng đồng tại persta.ai.",
  },
  hi: {
    title:
      "Persta.AI — AI ड्रेस-अप और किरदारों के लिए AI इलस्ट्रेशन जेनरेटर",
    description:
      "Persta एक AI प्लैटफ़ॉर्म है जहाँ आप अपने OC और पसंदीदा किरदारों को नए आउटफ़िट पहना सकते हैं: आउटफ़िट बदलें, कोऑर्डिनेटेड लुक और नए इलस्ट्रेशन स्टाइल बनाएँ। मुफ़्त आज़माएँ और persta.ai पर कम्यूनिटी से प्रेरणा पाएँ।",
  },
  ar: {
    title:
      "Persta.AI — تبديل ملابس الشخصيات وتوليد الرسوم التوضيحية بالذكاء الاصطناعي",
    description:
      "Persta منصّة ذكاء اصطناعي لتبديل ملابس شخصياتك الأصلية وشخصياتك المفضلة: أنشئ إطلالات منسّقة وأنماط رسوم جديدة بلمسة واحدة. جرّب مجانًا واستلهم من أعمال المجتمع على persta.ai.",
  },
} as const satisfies Record<Locale, {title: string; description: string}>;

const homeCopy = {
  ja: {
    metadataTitle:
      "Persta.AI (ペルスタ) | AIでキャラクターを着せ替え・イラスト生成",
    metadataDescription:
      "うちの子・推しキャラのイラストをAIでワンタップ着せ替え。コーディネートやスタイル変更のAIイラスト生成を無料で試せるAIスタイリングプラットフォームです。作品を投稿してコミュニティで共有しよう。",
    heading: "Persta | ペルスタ",
    subtitle: "着てみたいも、なりたいも。AIスタイリングプラットフォーム",
    organizationDescription:
      "Persta（ペルスタ）は、うちの子・推しキャラなどのイラストをAIで着せ替え・コーディネートできるAIイラスト生成／スタイリングプラットフォームです。",
  },
  en: {
    metadataTitle: "Persta.AI | AI Dress-Up & Character Illustration Generator",
    metadataDescription:
      "Dress up your OCs and favorite characters with AI. Generate outfit swaps, coordinated looks, and new illustration styles in one tap — free to try on Persta.AI.",
    heading: "Persta",
    subtitle:
      "An AI styling platform for the looks and characters you want to create.",
    organizationDescription:
      "Persta is an AI platform for dressing up and styling OCs, fashion, and other character illustrations with AI-generated outfit swaps.",
  },
  ko: {
    metadataTitle: "Persta.AI | AI 옷 갈아입히기·AI 일러스트 생성",
    metadataDescription:
      "내 캐릭터(오리캐)와 최애 일러스트를 AI로 원탭 옷 갈아입히기. 코디와 스타일 변경 AI 일러스트 생성을 무료로 체험할 수 있는 AI 스타일링 플랫폼입니다.",
    heading: "Persta",
    subtitle: "입고 싶은 모습도, 되고 싶은 모습도. AI 스타일링 플랫폼.",
    organizationDescription:
      "Persta는 내 캐릭터와 최애 일러스트를 AI로 옷 갈아입히기·코디할 수 있는 AI 일러스트 생성 플랫폼입니다.",
  },
  "zh-CN": {
    metadataTitle: "Persta.AI | AI 换装・AI 插画生成",
    metadataDescription:
      "用 AI 一键为你的自设角色（OC）和本命角色换装。免费体验服装搭配与风格变化的 AI 插画生成，并在社区分享作品。",
    heading: "Persta",
    subtitle: "想穿的样子，想成为的样子。AI 造型平台。",
    organizationDescription:
      "Persta 是一个 AI 插画生成平台，用 AI 为自设角色（OC）和喜欢的角色换装、搭配造型。",
  },
  "zh-TW": {
    metadataTitle: "Persta.AI | AI 換裝・AI 插畫生成",
    metadataDescription:
      "用 AI 一鍵為你的自創角色（OC）和本命角色換裝。免費體驗服裝搭配與風格變化的 AI 插畫生成，並在社群分享作品。",
    heading: "Persta",
    subtitle: "想穿的樣子，想成為的樣子。AI 造型平台。",
    organizationDescription:
      "Persta 是一個 AI 插畫生成平台，用 AI 為自創角色（OC）和喜歡的角色換裝、搭配造型。",
  },
  es: {
    metadataTitle:
      "Persta.AI | Cambio de ropa con IA y generación de ilustraciones",
    metadataDescription:
      "Viste a tus OCs y personajes favoritos con IA. Genera cambios de outfit, looks coordinados y nuevos estilos de ilustración con un toque. Pruébalo gratis en Persta.AI.",
    heading: "Persta",
    subtitle:
      "Lo que quieres llevar, lo que quieres ser. Plataforma de estilismo con IA.",
    organizationDescription:
      "Persta es una plataforma de IA para vestir y estilizar OCs, moda y otras ilustraciones de personajes con cambios de ropa generados por IA.",
  },
  pt: {
    metadataTitle:
      "Persta.AI | Troca de roupa com IA e geração de ilustrações",
    metadataDescription:
      "Vista seus OCs e personagens favoritos com IA. Gere trocas de roupa, looks coordenados e novos estilos de ilustração com um toque. Experimente grátis no Persta.AI.",
    heading: "Persta",
    subtitle:
      "O que você quer vestir, quem você quer ser. Plataforma de styling com IA.",
    organizationDescription:
      "Persta é uma plataforma de IA para vestir e estilizar OCs, moda e outras ilustrações de personagens com trocas de roupa geradas por IA.",
  },
  fr: {
    metadataTitle:
      "Persta.AI | Habillage IA et génération d'illustrations",
    metadataDescription:
      "Habillez vos OC et personnages préférés grâce à l'IA. Générez changements de tenue, looks coordonnés et nouveaux styles d'illustration en un geste. Essai gratuit sur Persta.AI.",
    heading: "Persta",
    subtitle:
      "Ce que vous voulez porter, ce que vous voulez devenir. Plateforme de stylisme IA.",
    organizationDescription:
      "Persta est une plateforme d'IA pour habiller et styliser des OC, de la mode et d'autres illustrations de personnages grâce à des changements de tenue générés par IA.",
  },
  de: {
    metadataTitle: "Persta.AI | KI-Anziehen & KI-Illustrationsgenerator",
    metadataDescription:
      "Ziehe deine OCs und Lieblingscharaktere mit KI um. Erstelle Outfit-Wechsel, abgestimmte Looks und neue Illustrationsstile mit einem Tipp – kostenlos ausprobieren auf Persta.AI.",
    heading: "Persta",
    subtitle: "Was du tragen willst, wer du sein willst. KI-Styling-Plattform.",
    organizationDescription:
      "Persta ist eine KI-Plattform, mit der du OCs, Mode und andere Charakter-Illustrationen mit KI-generierten Outfit-Wechseln stylst.",
  },
  it: {
    metadataTitle:
      "Persta.AI | Cambio d'abito con IA e generazione di illustrazioni",
    metadataDescription:
      "Vesti i tuoi OC e personaggi preferiti con l'IA. Genera cambi d'abito, look coordinati e nuovi stili di illustrazione con un tocco. Provalo gratis su Persta.AI.",
    heading: "Persta",
    subtitle:
      "Quello che vuoi indossare, quello che vuoi essere. Piattaforma di styling con IA.",
    organizationDescription:
      "Persta è una piattaforma di IA per vestire e stilizzare OC, moda e altre illustrazioni di personaggi con cambi d'abito generati dall'IA.",
  },
  id: {
    metadataTitle: "Persta.AI | Ganti Baju AI & Generator Ilustrasi AI",
    metadataDescription:
      "Ganti baju OC dan karakter favoritmu dengan AI. Buat pergantian outfit, padu padan gaya, dan gaya ilustrasi baru dalam sekali tap — coba gratis di Persta.AI.",
    heading: "Persta",
    subtitle:
      "Yang ingin kamu pakai, yang ingin kamu jadikan. Platform styling AI.",
    organizationDescription:
      "Persta adalah platform AI untuk mendandani OC, fashion, dan ilustrasi karakter lainnya dengan pergantian outfit hasil AI.",
  },
  th: {
    metadataTitle: "Persta.AI | AI เปลี่ยนชุดตัวละคร & สร้างภาพประกอบด้วย AI",
    metadataDescription:
      "เปลี่ยนชุดให้ OC และตัวละครที่คุณรักด้วย AI สร้างการเปลี่ยนชุด การแต่งตัว และสไตล์ภาพประกอบใหม่ ๆ ในแตะเดียว ทดลองฟรีที่ Persta.AI",
    heading: "Persta",
    subtitle: "สิ่งที่อยากใส่ สิ่งที่อยากเป็น แพลตฟอร์ม AI สไตลิ่ง",
    organizationDescription:
      "Persta คือแพลตฟอร์ม AI สำหรับเปลี่ยนชุดและจัดสไตล์ให้ OC แฟชั่น และภาพประกอบตัวละครอื่น ๆ ด้วยการเปลี่ยนชุดที่สร้างโดย AI",
  },
  vi: {
    metadataTitle: "Persta.AI | Thay trang phục AI & tạo ảnh minh họa AI",
    metadataDescription:
      "Thay trang phục cho OC và nhân vật yêu thích bằng AI. Tạo outfit mới, phối đồ và các phong cách minh họa khác nhau chỉ với một chạm — dùng thử miễn phí trên Persta.AI.",
    heading: "Persta",
    subtitle:
      "Điều bạn muốn mặc, điều bạn muốn trở thành. Nền tảng styling AI.",
    organizationDescription:
      "Persta là nền tảng AI giúp thay trang phục và tạo phong cách cho OC, thời trang và các ảnh minh họa nhân vật khác bằng trang phục do AI tạo ra.",
  },
  hi: {
    metadataTitle: "Persta.AI | AI ड्रेस-अप और AI इलस्ट्रेशन जेनरेटर",
    metadataDescription:
      "अपने OC और पसंदीदा किरदारों को AI से नए आउटफ़िट पहनाएँ। एक टैप में आउटफ़िट बदलें, कोऑर्डिनेटेड लुक और नए इलस्ट्रेशन स्टाइल बनाएँ — Persta.AI पर मुफ़्त आज़माएँ।",
    heading: "Persta",
    subtitle: "जो पहनना चाहें, जो बनना चाहें — AI स्टाइलिंग प्लैटफ़ॉर्म।",
    organizationDescription:
      "Persta एक AI प्लैटफ़ॉर्म है जहाँ OC, फ़ैशन और दूसरे किरदारों के इलस्ट्रेशन को AI-जेनरेटेड आउटफ़िट बदलाव से स्टाइल किया जा सकता है।",
  },
  ar: {
    metadataTitle:
      "Persta.AI | تبديل ملابس الشخصيات وتوليد الرسوم بالذكاء الاصطناعي",
    metadataDescription:
      "بدّل ملابس شخصياتك الأصلية وشخصياتك المفضلة بالذكاء الاصطناعي. أنشئ إطلالات منسّقة وأنماط رسوم جديدة بلمسة واحدة — جرّب مجانًا على Persta.AI.",
    heading: "Persta",
    subtitle:
      "ما تريد ارتداءه، ومن تريد أن تكون. منصّة تنسيق المظهر بالذكاء الاصطناعي.",
    organizationDescription:
      "Persta منصّة ذكاء اصطناعي لتبديل ملابس الشخصيات الأصلية والأزياء وسائر رسوم الشخصيات وتنسيق مظهرها بإطلالات مولّدة بالذكاء الاصطناعي.",
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

// /styles(スタイル一覧)と /styles/[slug](スタイル紹介)の SEO 向けコピー。
// detailDescription の {title} はスタイル名で置換して使う。
const stylesCopy = {
  ja: {
    indexTitle: "AI着せ替えスタイル一覧 | Persta.AI",
    indexDescription:
      "Perstaで使えるAI着せ替え・AIイラスト生成のスタイル一覧。制服・ドレス・ファンタジー衣装など、うちの子や推しキャラをワンタップで着せ替えられるスタイルを探せます。",
    indexHeading: "スタイル一覧",
    indexIntro:
      "うちの子・推しキャラのイラストをワンタップで着せ替えできるAIスタイルのカタログです。気になるスタイルを選んで、無料で試してみましょう。",
    detailTitleSuffix: "AI着せ替えスタイル | Persta.AI",
    detailDescription:
      "「{title}」スタイルで、うちの子・推しキャラのイラストをAIが着せ替え。画像をアップロードするだけで、{title}のAIイラストをワンタップ生成。無料でお試しできます。",
    cta: "このスタイルで着せ替える",
    related: "同じカテゴリのスタイル",
    allStyles: "スタイル一覧へ戻る",
    providerLabel: "提供: {name}",
  },
  en: {
    indexTitle: "AI Dress-Up Style Gallery | Persta.AI",
    indexDescription:
      "Browse AI dress-up and illustration styles on Persta: uniforms, dresses, fantasy outfits, and more. Restyle your OCs and favorite characters in one tap.",
    indexHeading: "Style Gallery",
    indexIntro:
      "A catalog of AI styles that dress up your OCs and favorite character illustrations in one tap. Pick a style and try it for free.",
    detailTitleSuffix: "AI Dress-Up Style | Persta.AI",
    detailDescription:
      "Dress up your OCs and favorite characters in the \"{title}\" style. Just upload an image and generate a {title} AI illustration in one tap — free to try.",
    cta: "Dress up with this style",
    related: "Styles in the same category",
    allStyles: "Back to Style Gallery",
    providerLabel: "By {name}",
  },
  ko: {
    indexTitle: "AI 옷 갈아입히기 스타일 목록 | Persta.AI",
    indexDescription:
      "Persta에서 쓸 수 있는 AI 옷 갈아입히기·AI 일러스트 생성 스타일 목록. 교복, 드레스, 판타지 의상 등 내 캐릭터와 최애를 원탭으로 갈아입혀 보세요.",
    indexHeading: "스타일 목록",
    indexIntro:
      "내 캐릭터(오리캐)와 최애 일러스트를 원탭으로 갈아입힐 수 있는 AI 스타일 카탈로그입니다. 마음에 드는 스타일을 골라 무료로 체험해 보세요.",
    detailTitleSuffix: "AI 옷 갈아입히기 스타일 | Persta.AI",
    detailDescription:
      "\"{title}\" 스타일로 내 캐릭터와 최애 일러스트를 AI가 갈아입혀 드립니다. 이미지를 업로드하면 {title} AI 일러스트를 원탭으로 생성. 무료 체험 가능.",
    cta: "이 스타일로 갈아입히기",
    related: "같은 카테고리의 스타일",
    allStyles: "스타일 목록으로 돌아가기",
    providerLabel: "제공: {name}",
  },
  "zh-CN": {
    indexTitle: "AI 换装风格一览 | Persta.AI",
    indexDescription:
      "浏览 Persta 上可用的 AI 换装·AI 插画生成风格：制服、礼服、奇幻服装等。一键为你的自设角色（OC）和本命角色换装。",
    indexHeading: "风格一览",
    indexIntro:
      "这是可一键为自设角色（OC）和本命角色插画换装的 AI 风格目录。挑选喜欢的风格，免费体验吧。",
    detailTitleSuffix: "AI 换装风格 | Persta.AI",
    detailDescription:
      "用「{title}」风格为你的自设角色和本命角色换装。只需上传图片，即可一键生成 {title} 的 AI 插画，免费体验。",
    cta: "用这个风格换装",
    related: "同类风格",
    allStyles: "返回风格一览",
    providerLabel: "提供：{name}",
  },
  "zh-TW": {
    indexTitle: "AI 換裝風格一覽 | Persta.AI",
    indexDescription:
      "瀏覽 Persta 上可用的 AI 換裝·AI 插畫生成風格：制服、禮服、奇幻服裝等。一鍵為你的自創角色（OC）和本命角色換裝。",
    indexHeading: "風格一覽",
    indexIntro:
      "這是可一鍵為自創角色（OC）和本命角色插畫換裝的 AI 風格目錄。挑選喜歡的風格，免費體驗吧。",
    detailTitleSuffix: "AI 換裝風格 | Persta.AI",
    detailDescription:
      "用「{title}」風格為你的自創角色和本命角色換裝。只需上傳圖片，即可一鍵生成 {title} 的 AI 插畫，免費體驗。",
    cta: "用這個風格換裝",
    related: "同類風格",
    allStyles: "返回風格一覽",
    providerLabel: "提供：{name}",
  },
  es: {
    indexTitle: "Galería de estilos de cambio de ropa con IA | Persta.AI",
    indexDescription:
      "Explora los estilos de cambio de ropa e ilustración con IA de Persta: uniformes, vestidos, trajes de fantasía y más. Cambia el look de tus OCs y personajes favoritos con un toque.",
    indexHeading: "Galería de estilos",
    indexIntro:
      "Un catálogo de estilos de IA para vestir a tus OCs y personajes favoritos con un toque. Elige un estilo y pruébalo gratis.",
    detailTitleSuffix: "Estilo de cambio de ropa con IA | Persta.AI",
    detailDescription:
      "Viste a tus OCs y personajes favoritos con el estilo «{title}». Solo sube una imagen y genera una ilustración de IA de {title} con un toque. Prueba gratis.",
    cta: "Vestir con este estilo",
    related: "Estilos de la misma categoría",
    allStyles: "Volver a la galería de estilos",
    providerLabel: "De {name}",
  },
  pt: {
    indexTitle: "Galeria de estilos de troca de roupa com IA | Persta.AI",
    indexDescription:
      "Explore os estilos de troca de roupa e ilustração com IA do Persta: uniformes, vestidos, trajes de fantasia e mais. Mude o visual dos seus OCs e personagens favoritos com um toque.",
    indexHeading: "Galeria de estilos",
    indexIntro:
      "Um catálogo de estilos de IA para vestir seus OCs e personagens favoritos com um toque. Escolha um estilo e experimente grátis.",
    detailTitleSuffix: "Estilo de troca de roupa com IA | Persta.AI",
    detailDescription:
      "Vista seus OCs e personagens favoritos com o estilo \"{title}\". Basta enviar uma imagem para gerar uma ilustração de IA de {title} com um toque. Experimente grátis.",
    cta: "Vestir com este estilo",
    related: "Estilos da mesma categoria",
    allStyles: "Voltar à galeria de estilos",
    providerLabel: "Por {name}",
  },
  fr: {
    indexTitle: "Galerie de styles d'habillage IA | Persta.AI",
    indexDescription:
      "Parcourez les styles d'habillage et d'illustration IA de Persta : uniformes, robes, tenues fantastiques et plus. Relookez vos OC et personnages préférés en un geste.",
    indexHeading: "Galerie de styles",
    indexIntro:
      "Un catalogue de styles IA pour habiller vos OC et personnages préférés en un geste. Choisissez un style et essayez-le gratuitement.",
    detailTitleSuffix: "Style d'habillage IA | Persta.AI",
    detailDescription:
      "Habillez vos OC et personnages préférés avec le style « {title} ». Téléversez une image et générez une illustration IA {title} en un geste. Essai gratuit.",
    cta: "Habiller avec ce style",
    related: "Styles de la même catégorie",
    allStyles: "Retour à la galerie de styles",
    providerLabel: "Par {name}",
  },
  de: {
    indexTitle: "KI-Anzieh-Stile im Überblick | Persta.AI",
    indexDescription:
      "Entdecke die KI-Anzieh- und Illustrationsstile von Persta: Uniformen, Kleider, Fantasy-Outfits und mehr. Style deine OCs und Lieblingscharaktere mit einem Tipp um.",
    indexHeading: "Stil-Galerie",
    indexIntro:
      "Ein Katalog von KI-Stilen, mit denen du OCs und Lieblingscharakter-Illustrationen mit einem Tipp umziehst. Wähle einen Stil und probiere ihn kostenlos aus.",
    detailTitleSuffix: "KI-Anzieh-Stil | Persta.AI",
    detailDescription:
      "Ziehe deine OCs und Lieblingscharaktere im Stil „{title}“ um. Einfach ein Bild hochladen und mit einem Tipp eine {title}-KI-Illustration erstellen. Kostenlos testen.",
    cta: "Mit diesem Stil anziehen",
    related: "Stile derselben Kategorie",
    allStyles: "Zurück zur Stil-Galerie",
    providerLabel: "Von {name}",
  },
  it: {
    indexTitle: "Galleria di stili di cambio d'abito con IA | Persta.AI",
    indexDescription:
      "Sfoglia gli stili di cambio d'abito e illustrazione con IA di Persta: uniformi, abiti, costumi fantasy e altro. Cambia look ai tuoi OC e personaggi preferiti con un tocco.",
    indexHeading: "Galleria di stili",
    indexIntro:
      "Un catalogo di stili IA per vestire i tuoi OC e personaggi preferiti con un tocco. Scegli uno stile e provalo gratis.",
    detailTitleSuffix: "Stile di cambio d'abito con IA | Persta.AI",
    detailDescription:
      "Vesti i tuoi OC e personaggi preferiti con lo stile «{title}». Carica un'immagine e genera un'illustrazione IA di {title} con un tocco. Prova gratuita.",
    cta: "Vesti con questo stile",
    related: "Stili della stessa categoria",
    allStyles: "Torna alla galleria di stili",
    providerLabel: "Di {name}",
  },
  id: {
    indexTitle: "Daftar gaya ganti baju AI | Persta.AI",
    indexDescription:
      "Jelajahi gaya ganti baju dan ilustrasi AI di Persta: seragam, gaun, kostum fantasi, dan lainnya. Ganti gaya OC dan karakter favoritmu dalam sekali tap.",
    indexHeading: "Galeri gaya",
    indexIntro:
      "Katalog gaya AI untuk mendandani ilustrasi OC dan karakter favoritmu dalam sekali tap. Pilih gaya dan coba gratis.",
    detailTitleSuffix: "Gaya ganti baju AI | Persta.AI",
    detailDescription:
      "Dandani OC dan karakter favoritmu dengan gaya \"{title}\". Cukup unggah gambar dan buat ilustrasi AI {title} dalam sekali tap. Coba gratis.",
    cta: "Ganti baju dengan gaya ini",
    related: "Gaya dalam kategori yang sama",
    allStyles: "Kembali ke galeri gaya",
    providerLabel: "Oleh {name}",
  },
  th: {
    indexTitle: "รวมสไตล์ AI เปลี่ยนชุด | Persta.AI",
    indexDescription:
      "เลือกชมสไตล์ AI เปลี่ยนชุดและสร้างภาพประกอบบน Persta ทั้งชุดนักเรียน เดรส ชุดแฟนตาซี และอีกมากมาย เปลี่ยนชุดให้ OC และตัวละครที่คุณรักได้ในแตะเดียว",
    indexHeading: "แกลเลอรีสไตล์",
    indexIntro:
      "แคตตาล็อกสไตล์ AI สำหรับเปลี่ยนชุดให้ภาพ OC และตัวละครที่คุณรักในแตะเดียว เลือกสไตล์ที่ชอบแล้วทดลองฟรี",
    detailTitleSuffix: "สไตล์ AI เปลี่ยนชุด | Persta.AI",
    detailDescription:
      "เปลี่ยนชุดให้ OC และตัวละครที่คุณรักด้วยสไตล์ \"{title}\" แค่อัปโหลดภาพก็สร้างภาพประกอบ AI สไตล์ {title} ได้ในแตะเดียว ทดลองฟรี",
    cta: "เปลี่ยนชุดด้วยสไตล์นี้",
    related: "สไตล์ในหมวดเดียวกัน",
    allStyles: "กลับไปที่แกลเลอรีสไตล์",
    providerLabel: "โดย {name}",
  },
  vi: {
    indexTitle: "Danh sách phong cách thay trang phục AI | Persta.AI",
    indexDescription:
      "Khám phá các phong cách thay trang phục và minh họa AI trên Persta: đồng phục, váy, trang phục fantasy và nhiều hơn nữa. Đổi phong cách cho OC và nhân vật yêu thích chỉ với một chạm.",
    indexHeading: "Thư viện phong cách",
    indexIntro:
      "Danh mục các phong cách AI giúp thay trang phục cho ảnh minh họa OC và nhân vật yêu thích chỉ với một chạm. Chọn phong cách và dùng thử miễn phí.",
    detailTitleSuffix: "Phong cách thay trang phục AI | Persta.AI",
    detailDescription:
      "Thay trang phục cho OC và nhân vật yêu thích với phong cách \"{title}\". Chỉ cần tải ảnh lên là tạo được ảnh minh họa AI {title} trong một chạm. Dùng thử miễn phí.",
    cta: "Thay trang phục với phong cách này",
    related: "Phong cách cùng danh mục",
    allStyles: "Quay lại thư viện phong cách",
    providerLabel: "Bởi {name}",
  },
  hi: {
    indexTitle: "AI ड्रेस-अप स्टाइल गैलरी | Persta.AI",
    indexDescription:
      "Persta पर उपलब्ध AI ड्रेस-अप और इलस्ट्रेशन स्टाइल देखें: यूनिफ़ॉर्म, ड्रेस, फ़ैंटेसी आउटफ़िट और भी बहुत कुछ। एक टैप में अपने OC और पसंदीदा किरदारों का लुक बदलें।",
    indexHeading: "स्टाइल गैलरी",
    indexIntro:
      "एक टैप में OC और पसंदीदा किरदारों के इलस्ट्रेशन को नए आउटफ़िट पहनाने वाले AI स्टाइल का कैटलॉग। कोई स्टाइल चुनें और मुफ़्त आज़माएँ।",
    detailTitleSuffix: "AI ड्रेस-अप स्टाइल | Persta.AI",
    detailDescription:
      "\"{title}\" स्टाइल में अपने OC और पसंदीदा किरदारों को सजाएँ। बस एक इमेज अपलोड करें और एक टैप में {title} की AI इलस्ट्रेशन बनाएँ। मुफ़्त आज़माएँ।",
    cta: "इस स्टाइल से ड्रेस-अप करें",
    related: "इसी कैटेगरी के स्टाइल",
    allStyles: "स्टाइल गैलरी पर वापस जाएँ",
    providerLabel: "{name} द्वारा",
  },
  ar: {
    indexTitle: "معرض أنماط تبديل الملابس بالذكاء الاصطناعي | Persta.AI",
    indexDescription:
      "تصفّح أنماط تبديل الملابس وتوليد الرسوم بالذكاء الاصطناعي على Persta: أزياء مدرسية وفساتين وأزياء خيالية والمزيد. غيّر إطلالة شخصياتك الأصلية وشخصياتك المفضلة بلمسة واحدة.",
    indexHeading: "معرض الأنماط",
    indexIntro:
      "دليل أنماط الذكاء الاصطناعي لتبديل ملابس رسوم شخصياتك الأصلية وشخصياتك المفضلة بلمسة واحدة. اختر نمطًا وجرّبه مجانًا.",
    detailTitleSuffix: "نمط تبديل الملابس بالذكاء الاصطناعي | Persta.AI",
    detailDescription:
      "بدّل ملابس شخصياتك الأصلية وشخصياتك المفضلة بنمط «{title}». ما عليك سوى رفع صورة لتوليد رسم بالذكاء الاصطناعي بنمط {title} بلمسة واحدة. جرّب مجانًا.",
    cta: "بدّل الملابس بهذا النمط",
    related: "أنماط من الفئة نفسها",
    allStyles: "العودة إلى معرض الأنماط",
    providerLabel: "بواسطة {name}",
  },
} as const satisfies Record<
  Locale,
  {
    indexTitle: string;
    indexDescription: string;
    indexHeading: string;
    indexIntro: string;
    detailTitleSuffix: string;
    detailDescription: string;
    cta: string;
    related: string;
    allStyles: string;
    providerLabel: string;
  }
>;

export function getSiteCopy(locale: Locale) {
  return siteCopy[locale];
}

export function getStylesCopy(locale: Locale) {
  return stylesCopy[locale];
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
