exports.handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      message: "test-video function works"
    })
  };
};
