// Existing UI scenarios use a Taiwan visitor unless testing geography explicitly.
exports.mockTaiwan = target => target.route("https://api.country.is/**", route => route.fulfill({
  status: 200, contentType: "application/json",
  headers: { "access-control-allow-origin": "*" }, body: '{"country":"TW"}'
}));
