import type { DriveStep } from "driver.js";

export interface TutorialTourCopy {
  coordinateTitle: string;
  coordinateDescription: string;
  uploadTitle: string;
  uploadDescription: string;
  promptTitle: string;
  promptDescription: string;
  backgroundTitle: string;
  backgroundDescription: string;
  generateTitle: string;
  generateDescription: string;
  generatingTitle: string;
  generatingDescription: string;
  completedTitle: string;
  firstImageTitle: string;
  firstImageDescription: string;
  finishedTitle: string;
  finishedDescription: string;
}

export function getTourSteps(copy: TutorialTourCopy): DriveStep[] {
  return [
    {
      element: '[data-tour="coordinate-nav"]',
      popover: {
        title: copy.coordinateTitle,
        description: copy.coordinateDescription,
        side: "top",
        align: "center",
      },
    },
    {
      element: '[data-tour="tour-image-upload"]',
      popover: {
        title: copy.uploadTitle,
        description: copy.uploadDescription,
        side: "bottom",
        align: "start",
      },
    },
    {
      element: '[data-tour="tour-prompt-input"]',
      popover: {
        title: copy.promptTitle,
        description: copy.promptDescription,
        side: "top",
        align: "start",
      },
    },
    {
      element: '[data-tour="tour-background-change"]',
      popover: {
        title: copy.backgroundTitle,
        description: copy.backgroundDescription,
        side: "right",
        align: "center",
      },
    },
    {
      element: '[data-tour="tour-generate-btn"]',
      popover: {
        title: copy.generateTitle,
        description: copy.generateDescription,
        side: "top",
        align: "center",
        showButtons: ["previous"],
      },
    },
    {
      element: '[data-tour="tour-generating"]',
      popover: {
        title: copy.generatingTitle,
        description: copy.generatingDescription,
        side: "bottom",
        align: "start",
        showButtons: [],
      },
    },
    {
      popover: {
        title: copy.completedTitle,
        description: "",
        side: "over",
        align: "center",
        showButtons: ["next"],
      },
    },
    {
      element: '[data-tour="tour-first-image"]',
      popover: {
        title: copy.firstImageTitle,
        description: copy.firstImageDescription,
        side: "top",
        align: "center",
        showButtons: ["next"],
      },
    },
    {
      popover: {
        title: copy.finishedTitle,
        description: copy.finishedDescription,
        side: "over",
        align: "center",
        showButtons: ["next"],
      },
    },
  ];
}
