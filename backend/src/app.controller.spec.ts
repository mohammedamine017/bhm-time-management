import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns the application health status', () => {
    const controller = new AppController();

    expect(controller.health()).toEqual({
      status: 'ok',
      application: 'BHM Time Management V2',
    });
  });
});

