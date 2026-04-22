import request from './request';

const bufferApi = {
  // 执行缓冲区分析
  analyzeBuffer: (data) => request.post('/buffer', data)
};

export default bufferApi;
