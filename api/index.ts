import { createHealthCheckResponse } from "../src/utils/http";

export const config = {
    runtime: "edge",
};

export default async (req: Request): Promise<Response> => {
    return createHealthCheckResponse();
};
