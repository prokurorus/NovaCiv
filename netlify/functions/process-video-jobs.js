exports.handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      message: "process-video-jobs minimal test OK"
    })
  };
};
