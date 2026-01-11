// Stripe Pricing Table Webコンポーネントの型定義

import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "stripe-pricing-table": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        "pricing-table-id": string;
        "publishable-key": string;
        "client-reference-id"?: string;
      };
    }
  }
}
