package cws;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.leslaborie.cws.ChatelWindsurfApplication;
import org.springframework.test.context.web.WebAppConfiguration;
import org.springframework.boot.test.SpringApplicationConfiguration;
import org.springframework.test.context.junit4.SpringJUnit4ClassRunner;

@RunWith(SpringJUnit4ClassRunner.class)
@SpringApplicationConfiguration(classes = ChatelWindsurfApplication.class)
@WebAppConfiguration
public class ChatelWindsurfApplicationTests {

	@Test
	public void contextLoads() {
	}

}
