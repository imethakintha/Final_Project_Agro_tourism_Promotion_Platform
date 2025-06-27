import { serializeUser, deserializeUser, use } from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User, { findById, findOne } from '../models/User'; // Ensure path is correct, e.g., ../models/User

serializeUser((user, done) => {
  done(null, user.id);
});

deserializeUser((id, done) => {
  findById(id).then((user) => {
    done(null, user);
  });
});

use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/users/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const existingUser = await findOne({ 'socialLogins.google': profile.id });

        if (existingUser) {
          // User exists, update their tokens for future use
          existingUser.socialLogins.googleAccessToken = accessToken;
          existingUser.socialLogins.googleRefreshToken = refreshToken;
          await existingUser.save();
          return done(null, existingUser);
        } else {
          // If not, create a new user in our db
          const newUser = new User({
            email: profile.emails[0].value,
            role: 'tourist',
            profile: {
              firstName: profile.name.givenName,
              lastName: profile.name.familyName,
              avatar: profile.photos[0].value,
            },
            socialLogins: {
              google: profile.id,
              googleAccessToken: accessToken,
              googleRefreshToken: refreshToken,
            },
            verification: {
              email: true
            },
            password: 'social_login_no_password'
          });
          
          await newUser.save({ validateBeforeSave: false });
          return done(null, newUser);
        }
      } catch (err) {
        return done(err, null);
      }
    }
  )
);