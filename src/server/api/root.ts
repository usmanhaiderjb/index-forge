import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { accountRouter } from "@/server/api/routers/account";
import { aiRouter } from "@/server/api/routers/ai";
import { alertRouter } from "@/server/api/routers/alert";
import { appRouter as appsRouter } from "@/server/api/routers/app";
import { competitorRouter } from "@/server/api/routers/competitor";
import { connectionRouter } from "@/server/api/routers/connection";
import { contactRouter } from "@/server/api/routers/contact";
import { crossLocaleRouter } from "@/server/api/routers/crosslocale";
import { deviceRouter } from "@/server/api/routers/device";
import { digestRouter } from "@/server/api/routers/digest";
import { gapsRouter } from "@/server/api/routers/gaps";
import { intelligenceRouter } from "@/server/api/routers/intelligence";
import { advertisingRouter } from "@/server/api/routers/advertising";
import { cppRouter } from "@/server/api/routers/cpp";
import { cannibalizationRouter } from "@/server/api/routers/cannibalization";
import { keywordRouter } from "@/server/api/routers/keyword";
import { metricsRouter } from "@/server/api/routers/metrics";
import { mobileRouter } from "@/server/api/routers/mobile";
import { monetizationRouter } from "@/server/api/routers/monetization";
import { orgRouter } from "@/server/api/routers/org";
import { pushRouter } from "@/server/api/routers/push";
import { researchRouter } from "@/server/api/routers/research";
import { reviewRouter } from "@/server/api/routers/review";
import { techStackRouter } from "@/server/api/routers/techstack";
import { trendsRouter } from "@/server/api/routers/trends";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";

export const appRouter = createTRPCRouter({
  account: accountRouter,
  ai: aiRouter,
  alerts: alertRouter,
  apps: appsRouter,
  competitors: competitorRouter,
  connections: connectionRouter,
  contact: contactRouter,
  crossLocale: crossLocaleRouter,
  device: deviceRouter,
  digests: digestRouter,
  gaps: gapsRouter,
  intelligence: intelligenceRouter,
  advertising: advertisingRouter,
  cpp: cppRouter,
  cannibalization: cannibalizationRouter,
  keywords: keywordRouter,
  metrics: metricsRouter,
  mobile: mobileRouter,
  monetization: monetizationRouter,
  org: orgRouter,
  push: pushRouter,
  research: researchRouter,
  reviews: reviewRouter,
  techStack: techStackRouter,
  trends: trendsRouter,
});

export type AppRouter = typeof appRouter;

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export const createCaller = createCallerFactory(appRouter);
