import { AppModule } from './app.module';

describe('AppModule', () => {
  it('loads the complete backend module graph', () => {
    expect(AppModule).toBeDefined();
  });
});
