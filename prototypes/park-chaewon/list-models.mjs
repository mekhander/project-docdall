// 사용 가능한 모델 이름만 보여 준다. 사용: node --env-file=.env list-models.mjs
const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
  headers: { "x-goog-api-key": process.env.GEMINI_API_KEY || "" },
});
console.log("status", res.status);
if (res.ok) {
  const data = await res.json();
  const names = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => m.name.replace("models/", ""));
  console.log(names.join("\n"));
}
