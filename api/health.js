module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    success: true,
    service: "XYDOWN",
    build: "media-validation-af36322-baeb788",
    downloads: ["mp4", "mp3", "jpg", "png", "webp"],
    note: "Only verified media bytes are served as downloads."
  });
};
